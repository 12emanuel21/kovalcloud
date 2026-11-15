import { BadRequestException, Injectable } from '@nestjs/common';
import type { Order, Restaurant } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildCheckoutUrl,
  buildIntegritySignature,
  generatePaymentReference,
  nextPaymentReference,
  toAmountInCents,
  WOMPI_CURRENCY,
} from './wompi';

/** Estados tras un intento que no cobró: el siguiente link lleva referencia nueva */
const PAYMENT_RETRY_STATUSES = ['FAILED', 'CANCELLED'];

type CheckoutRestaurant = Pick<Restaurant, 'slug' | 'wompiPublicKey' | 'wompiIntegritySecret' | 'wompiEventSecret'>;

/**
 * ¿Puede el local cobrar en línea? Hace falta la llave pública y el secreto de integridad
 * (link de pago) y el secreto de eventos (webhook que confirma el pago).
 */
export function isWompiReady(restaurant: Partial<CheckoutRestaurant>): boolean {
  return Boolean(restaurant.wompiPublicKey && restaurant.wompiIntegritySecret && restaurant.wompiEventSecret);
}

/** ¿Ofrecer "Pagar en línea"? Llaves completas Y el interruptor manual del dueño encendido */
export function isOnlinePaymentEnabled(restaurant: Partial<CheckoutRestaurant> & { isWompiEnabled?: boolean }): boolean {
  return restaurant.isWompiEnabled === true && isWompiReady(restaurant);
}

/**
 * Generación del link al Web Checkout de Wompi. Separado de PaymentsService (webhook) para que
 * OrdersService lo use sin dependencia circular entre módulos.
 */
@Injectable()
export class WompiCheckoutService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Asigna paymentReference si el pedido aún no tiene (un link pendiente se reutiliza tal cual; tras
   * un pago rechazado va con referencia nueva) y devuelve el link con monto en centavos y firma de integridad.
   */
  async generatePaymentLink(
    order: Pick<Order, 'id' | 'total' | 'paymentReference' | 'paymentStatus'>,
    restaurant: CheckoutRestaurant,
  ): Promise<{ url: string; reference: string }> {
    if (!restaurant.wompiPublicKey || !restaurant.wompiIntegritySecret) {
      throw new BadRequestException('El restaurante no tiene configurados los pagos en línea (Wompi)');
    }
    if (order.paymentStatus === 'PAID') throw new BadRequestException('Este pedido ya está pagado');

    let reference = order.paymentReference;
    if (!reference) {
      reference = generatePaymentReference(order.id);
      await this.prisma.order.update({ where: { id: order.id }, data: { paymentReference: reference } });
    } else if (PAYMENT_RETRY_STATUSES.includes(order.paymentStatus)) {
      // El intento anterior fue rechazado/anulado: Wompi no acepta repetir la referencia.
      // La nueva conserva la base (-r2, -r3...) y el pedido vuelve a "pago pendiente".
      reference = nextPaymentReference(reference);
      await this.prisma.order.update({
        where: { id: order.id },
        data: { paymentReference: reference, paymentStatus: 'PENDING' },
      });
    }

    const amountInCents = toAmountInCents(order.total);
    const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '');
    const url = buildCheckoutUrl({
      publicKey: restaurant.wompiPublicKey,
      reference,
      amountInCents,
      integritySignature: buildIntegritySignature(reference, amountInCents, WOMPI_CURRENCY, restaurant.wompiIntegritySecret),
      redirectUrl: frontendUrl ? `${frontendUrl}/menu/${restaurant.slug}?pedido=${order.id}` : undefined,
    });
    return { url, reference };
  }
}
