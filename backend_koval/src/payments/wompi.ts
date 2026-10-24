import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/** Web Checkout de Wompi (redirección a la página de pago) */
export const WOMPI_CHECKOUT_URL = 'https://checkout.wompi.co/p/';
export const WOMPI_CURRENCY = 'COP';

/** Estado de pago interno (Order.paymentStatus) */
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';

/** Estado de transacción de Wompi -> estado de pago del pedido (PENDING no cambia nada) */
const WOMPI_STATUS_MAP: Record<string, PaymentStatus> = {
  APPROVED: 'PAID',
  DECLINED: 'FAILED',
  ERROR: 'FAILED',
  VOIDED: 'CANCELLED',
};

export function mapWompiStatus(status: unknown): PaymentStatus | null {
  return typeof status === 'string' ? (WOMPI_STATUS_MAP[status.toUpperCase()] ?? null) : null;
}

/** Monto en centavos (Order.total es Float en pesos) */
export const toAmountInCents = (total: number) => Math.round(total * 100);

/** Referencia única para la pasarela: KOV-<8 primeros del pedido>-<8 hex aleatorios> */
export function generatePaymentReference(orderId: string): string {
  return `KOV-${orderId.replace(/-/g, '').slice(0, 8).toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Firma de integridad del checkout (obligatoria en Wompi):
 * SHA256(referencia + monto_en_centavos + moneda + secreto_de_integridad).
 */
export function buildIntegritySignature(
  reference: string,
  amountInCents: number,
  currency: string,
  integritySecret: string,
): string {
  return sha256(`${reference}${amountInCents}${currency}${integritySecret}`);
}

export function buildCheckoutUrl(params: {
  publicKey: string;
  reference: string;
  amountInCents: number;
  integritySignature: string;
  redirectUrl?: string;
}): string {
  const query: Array<[string, string]> = [
    ['public-key', params.publicKey],
    ['currency', WOMPI_CURRENCY],
    ['amount-in-cents', String(params.amountInCents)],
    ['reference', params.reference],
    ['signature:integrity', params.integritySignature],
  ];
  if (params.redirectUrl) query.push(['redirect-url', params.redirectUrl]);
  // Las claves de Wompi llevan ":" y "-": se codifican solo los valores
  return `${WOMPI_CHECKOUT_URL}?${query.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

/** Evento de Wompi (solo los campos que usamos) */
export interface WompiEvent {
  event?: string;
  data?: {
    transaction?: {
      id?: string;
      reference?: string;
      status?: string;
      amount_in_cents?: number;
      currency?: string;
      payment_method_type?: string;
    };
  };
  signature?: { properties?: string[]; checksum?: string };
  timestamp?: number;
}

const readPath = (source: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined), source);

/**
 * Verifica la firma de un evento de Wompi:
 * SHA256(valores de signature.properties (leídos de `data`) + timestamp + secreto de eventos)
 * debe ser igual a signature.checksum. Comparación en tiempo constante.
 */
export function verifyWompiEventChecksum(event: WompiEvent, eventSecret: string): boolean {
  const properties = event.signature?.properties;
  const checksum = event.signature?.checksum;
  if (!Array.isArray(properties) || properties.length === 0 || typeof checksum !== 'string' || event.timestamp === undefined) {
    return false;
  }
  const values = properties.map((property) => readPath(event.data, property));
  if (values.some((value) => value === undefined || value === null)) return false;

  const expected = Buffer.from(sha256(`${values.map(String).join('')}${event.timestamp}${eventSecret}`), 'hex');
  const received = Buffer.from(checksum.toLowerCase(), 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}
