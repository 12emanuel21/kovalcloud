import { BadRequestException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { Order, Restaurant } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersGateway } from '../orders/orders.gateway';
import { OrdersService } from '../orders/orders.service';
import { sanitizeRestaurant } from '../restaurants/sanitize-restaurant';
import {
  type WompiEvent,
  fetchWompiTransaction,
  mapWompiStatus,
  toAmountInCents,
  verifyWompiEventChecksum,
  WOMPI_CURRENCY,
  WompiUnavailableError,
} from './wompi';
import { isRecordNotFound, isUniqueViolation } from '../prisma/prisma-errors';
import { WompiCheckoutService } from './wompi-checkout.service';

// No promete que ya se cocina: el pago no cambia el estado del pedido en cocina
export const PAYMENT_CONFIRMED_MESSAGE = '¡Pago confirmado! 💳 Hemos notificado al restaurante para que inicie tu orden.';

type WebhookResult = { received: true; ignored?: string; paymentStatus?: string };

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly ordersGateway: OrdersGateway,
    private readonly wompiCheckout: WompiCheckoutService,
  ) {}

  /** Link al Web Checkout de Wompi (ver WompiCheckoutService) */
  generateWompiPaymentLink(
    order: Pick<Order, 'id' | 'total' | 'paymentReference' | 'paymentStatus'>,
    restaurant: Pick<Restaurant, 'slug' | 'wompiPublicKey' | 'wompiIntegritySecret' | 'wompiEventSecret'>,
  ): Promise<string> {
    return this.wompiCheckout.generatePaymentLink(order, restaurant).then(({ url }) => url);
  }

  /**
   * Webhook de Wompi (transaction.updated). Solo se actúa si la firma del evento es válida con el
   * secreto de eventos del restaurante del pedido y el monto coincide con el total; con llave privada,
   * el pago aprobado se verifica además con la API de Wompi. Idempotente (también con webhooks simultáneos).
   */
  async handleWompiEvent(event: WompiEvent): Promise<WebhookResult> {
    if (event?.event !== 'transaction.updated') return { received: true, ignored: 'event_type' };

    const transaction = event.data?.transaction;
    const reference = transaction?.reference;
    if (!reference) throw new BadRequestException('Evento sin data.transaction.reference');

    const order = await this.prisma.order.findUnique({
      where: { paymentReference: reference },
      include: { restaurant: true, items: { include: { menuItem: true } } },
    });
    if (!order) {
      this.logger.warn(`Wompi: no hay pedido con referencia ${reference}`);
      return { received: true, ignored: 'order_not_found' };
    }

    const secret = order.restaurant.wompiEventSecret;
    if (!secret || !verifyWompiEventChecksum(event, secret)) {
      this.logger.warn(`Wompi: firma inválida o sin secreto de eventos (referencia ${reference})`);
      throw new UnauthorizedException('Firma del evento inválida');
    }

    const paymentStatus = mapWompiStatus(transaction.status);
    if (!paymentStatus) return { received: true, ignored: 'status_pending' };
    if (order.paymentStatus === 'PAID') return { received: true, ignored: 'already_paid', paymentStatus: 'PAID' };

    if (
      paymentStatus === 'PAID' &&
      (transaction.amount_in_cents !== toAmountInCents(order.total) || transaction.currency !== WOMPI_CURRENCY)
    ) {
      this.logger.error(
        `Wompi: monto no coincide en ${reference} (${transaction.amount_in_cents} ${transaction.currency} vs ${toAmountInCents(order.total)} ${WOMPI_CURRENCY})`,
      );
      return { received: true, ignored: 'amount_mismatch' };
    }

    // P1-2: con la llave privada del local, el pago se confirma con la API de Wompi (el checksum
    // solo prueba que el evento lo firmó alguien con el secreto de eventos)
    if (paymentStatus === 'PAID' && order.restaurant.wompiPrivateKey) {
      const verified = await this.verifyApprovedTransaction(transaction.id, order.restaurant.wompiPrivateKey, {
        reference,
        amountInCents: toAmountInCents(order.total),
      });
      if (!verified) return { received: true, ignored: 'transaction_not_verified' };
    }

    // Atómico e idempotente: la condición va en el mismo UPDATE. Con dos webhooks simultáneos
    // (Wompi reintenta) solo uno cambia la fila, emite al Kanban y avisa al cliente.
    const updated = await this.prisma.order
      .update({
        where: { id: order.id, paymentStatus: { not: 'PAID' } },
        data: {
          paymentStatus,
          paymentMethod: transaction.payment_method_type ?? order.paymentMethod,
          ...(paymentStatus === 'PAID' && transaction.id ? { wompiTransactionId: String(transaction.id) } : {}),
        },
        include: { restaurant: true, items: { include: { menuItem: true } } },
      })
      .catch((error: unknown) => {
        if (isRecordNotFound(error)) return null;
        if (isUniqueViolation(error)) {
          this.logger.error(`Wompi: la transacción ${transaction.id} ya pagó otro pedido (referencia ${reference})`);
          return null;
        }
        throw error;
      });
    if (!updated) return { received: true, ignored: 'already_paid', paymentStatus: 'PAID' };
    this.logger.log(`Wompi: pedido ${order.id} -> ${paymentStatus} (${reference})`);

    // Kanban/KDS en tiempo real (sin credenciales del restaurante)
    this.ordersGateway.emitOrderStatusUpdated(updated.restaurantId, {
      ...updated,
      restaurant: sanitizeRestaurant(updated.restaurant),
    });
    if (paymentStatus === 'PAID') void this.ordersService.notifyCustomer(updated, PAYMENT_CONFIRMED_MESSAGE);

    return { received: true, paymentStatus };
  }

  /**
   * GET /transactions/:id: APPROVED, misma referencia, mismo monto y en COP. Sin respuesta de Wompi
   * se responde 503 para que Wompi reintente el webhook más tarde.
   */
  private async verifyApprovedTransaction(
    transactionId: string | undefined,
    privateKey: string,
    expected: { reference: string; amountInCents: number },
  ): Promise<boolean> {
    if (!transactionId) {
      this.logger.error(`Wompi: evento APPROVED sin transaction.id (referencia ${expected.reference})`);
      return false;
    }
    let remote;
    try {
      remote = await fetchWompiTransaction(String(transactionId), privateKey);
    } catch (error) {
      if (error instanceof WompiUnavailableError) {
        this.logger.warn(`Wompi: no se pudo verificar la transacción ${transactionId}: ${error.message}`);
        throw new ServiceUnavailableException('No se pudo verificar la transacción con Wompi');
      }
      throw error;
    }
    const ok =
      remote !== null &&
      remote.status === 'APPROVED' &&
      remote.reference === expected.reference &&
      remote.amount_in_cents === expected.amountInCents &&
      remote.currency === WOMPI_CURRENCY;
    if (!ok) {
      this.logger.error(
        `Wompi: la transacción ${transactionId} no coincide con la API (${remote ? `${remote.status} ${remote.reference} ${remote.amount_in_cents} ${remote.currency}` : 'no existe'}; se esperaba APPROVED ${expected.reference} ${expected.amountInCents} ${WOMPI_CURRENCY})`,
      );
    }
    return ok;
  }
}
