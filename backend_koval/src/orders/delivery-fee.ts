import { OrderType } from '@prisma/client';
import { formatDailyNumber } from './daily-number';

/**
 * Domicilio manual: el local decide el valor de cada domicilio en el Kanban (botones rápidos, según
 * dirección, hora o clima) y el cliente lo recibe por WhatsApp. Con tarifa fija única, se cobra sola.
 */

/** Montos sugeridos por defecto de los botones del Kanban (0 = Gratis) */
export const DEFAULT_DELIVERY_FEE_PRESETS = [0, 3000, 4000, 5000, 6000, 8000];
export const MAX_DELIVERY_FEE_PRESETS = 10;
export const MAX_DELIVERY_FEE = 1_000_000;

/** Nota del resumen mientras el local no ha definido el domicilio */
export const DELIVERY_FEE_PENDING_NOTE = '🛵 Domicilio: por confirmar según dirección y clima';

const isFee = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_DELIVERY_FEE;

/** Montos limpios: pesos enteros, sin repetir, de menor a mayor, máximo 10 */
export function cleanDeliveryFeePresets(values: unknown[]): number[] {
  const fees = values.filter(isFee).map((value) => Math.round(value));
  return [...new Set(fees)].sort((a, b) => a - b).slice(0, MAX_DELIVERY_FEE_PRESETS);
}

/** Montos guardados (Json) -> lista usable; sin configurar o vacía: los de siempre */
export function resolveDeliveryFeePresets(value: unknown): number[] {
  const presets = Array.isArray(value) ? cleanDeliveryFeePresets(value) : [];
  return presets.length > 0 ? presets : [...DEFAULT_DELIVERY_FEE_PRESETS];
}

/** Tarifa fija única válida (0 = domicilio siempre gratis) o null si no se usa */
export function usableFlatDeliveryFee(value: unknown): number | null {
  return isFee(value) ? Math.round(value) : null;
}

/**
 * Domicilio con el que nace un pedido: recoger y mesa no pagan envío; un domicilio con tarifa fija
 * la cobra de una vez; sin tarifa fija queda en 0 y pendiente de que el local lo defina.
 */
export function initialDeliveryFee(
  orderType: OrderType | string | null | undefined,
  restaurant: { flatDeliveryFee?: number | null },
): { deliveryFee: number; deliveryFeePending: boolean } {
  if ((orderType ?? OrderType.DELIVERY) !== OrderType.DELIVERY) return { deliveryFee: 0, deliveryFeePending: false };
  const flat = usableFlatDeliveryFee(restaurant.flatDeliveryFee);
  return flat !== null ? { deliveryFee: flat, deliveryFeePending: false } : { deliveryFee: 0, deliveryFeePending: true };
}

const money = (value: number) => `$${Math.round(value).toLocaleString('es-CO')}`;

/** "Gratis" o "$5.000" (botones, Kanban y mensajes) */
export const formatDeliveryFee = (fee: number) => (fee === 0 ? 'Gratis' : money(fee));

/** Medios de pago con transferencia o en línea (los que esperan comprobante o link) */
const TRANSFER_METHODS = ['TRANSFERENCIA', 'NEQUI', 'BANCOLOMBIA', 'DAVIPLATA', 'TRANSFER'];

/**
 * WhatsApp al cliente cuando el local define el domicilio: valor, total definitivo y cómo pagar.
 * El pedido sigue en Pendientes: pasa a cocina cuando el local verifica el pago o la confirmación.
 */
export function buildDeliveryFeeMessage(params: {
  dailyNumber: number;
  deliveryFee: number;
  subtotal: number;
  total: number;
  paymentMethod?: string | null;
  paymentDetails?: string | null;
  /** Link de Wompi con el total definitivo (pedidos que eligieron pagar en línea) */
  paymentUrl?: string | null;
}): string {
  const ref = formatDailyNumber(params.dailyNumber);
  const fee = params.deliveryFee === 0 ? '¡Gratis! 🎉' : `${money(params.deliveryFee)} COP`;
  const lines = [
    `🛵 *Domicilio de tu pedido ${ref}:* ${fee}`,
    `Productos: ${money(params.subtotal)} COP`,
    `*Total a pagar: ${money(params.total)} COP*`,
  ];

  const details = params.paymentDetails?.trim();
  let howToPay: string;
  if (params.paymentUrl) {
    howToPay = `💳 Paga en línea aquí:\n${params.paymentUrl}`;
  } else if (params.paymentMethod === 'CASH') {
    howToPay = details
      ? `💵 Pagas en efectivo al recibir. Si prefieres transferir:\n${details}`
      : '💵 Pagas en efectivo al recibir.';
  } else if (details) {
    howToPay = `💳 *Medios de pago:*\n${details}\n\nEnvíanos la captura del comprobante por aquí.`;
  } else {
    howToPay = TRANSFER_METHODS.includes(params.paymentMethod ?? '')
      ? 'En un momento te compartimos los datos para la transferencia.'
      : 'Puedes pagar en efectivo al recibir o por transferencia.';
  }

  return `${lines.join('\n')}\n\n${howToPay}\n\nEn cuanto verifiquemos tu pago o confirmación, tu pedido pasa a cocina 👨‍🍳`;
}
