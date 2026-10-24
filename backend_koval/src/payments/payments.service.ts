import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { Order, Restaurant } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersGateway } from '../orders/orders.gateway';
import { OrdersService } from '../orders/orders.service';
import { sanitizeRestaurant } from '../restaurants/sanitize-restaurant';
import { type WompiEvent, mapWompiStatus, toAmountInCents, verifyWompiEventChecksum, WOMPI_CURRENCY } from './wompi';
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
   * secreto de eventos del restaurante del pedido y el monto coincide con el total. Idempotente.
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

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus, paymentMethod: transaction.payment_method_type ?? order.paymentMethod },
      include: { restaurant: true, items: { include: { menuItem: true } } },
    });
    this.logger.log(`Wompi: pedido ${order.id} -> ${paymentStatus} (${reference})`);

    // Kanban/KDS en tiempo real (sin credenciales del restaurante)
    this.ordersGateway.emitOrderStatusUpdated(updated.restaurantId, {
      ...updated,
      restaurant: sanitizeRestaurant(updated.restaurant),
    });
    if (paymentStatus === 'PAID') void this.ordersService.notifyCustomer(updated, PAYMENT_CONFIRMED_MESSAGE);

    return { received: true, paymentStatus };
  }
}
