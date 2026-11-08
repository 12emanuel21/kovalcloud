import { formatDailyNumber } from '../orders/daily-number';
import { OrderType } from '@prisma/client';
import type { OrderIntent } from '../ai/ai.service';
import type { DeliveryQuote } from '../delivery-zones/delivery-coverage';

export interface MenuItemRef {
  id: string;
  name: string;
  price: number;
}

export interface OrderLine {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  /** Nota del cliente para la cocina ("sin cebolla") */
  notes?: string;
}

const money = (value: number) => `$${value.toLocaleString('es-CO')}`;

/** El valor del domicilio depende de la zona y lo define el local: el bot nunca lo inventa */
export const DELIVERY_FEE_NOTE = 'El valor del domicilio, si aplica, se suma según tu zona.';

/** Flete que se cobra con el pedido (0 si no es domicilio o el local no configuró zonas) */
export const deliveryFeeOf = (quote: DeliveryQuote | null | undefined) => (quote?.isCovered ? quote.deliveryFee : 0);

/** Domicilio fuera de las zonas del local: se ofrece recoger (o se pide el barrio si no lo dijo) */
export function buildOutOfCoverageMessage(ai: OrderIntent): string {
  const place = ai.neighborhood?.trim();
  if (!place) return '¿En qué barrio queda la dirección? Así te confirmo el valor del domicilio.';
  return `Por ahora no tenemos cobertura de domicilio en ${place}. ¿Quieres pedirlo para recoger en el local?`;
}

/** "Limonada Cerezada " -> "limonada cerezada" (sin tildes ni mayúsculas) */
const normalizeName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Cruza los items de la IA con el menú de la BD. Los precios SIEMPRE salen de la BD
 * (la IA nunca fija precios). Se busca por ID y, si la IA puso el nombre en vez del ID, por
 * nombre exacto. Productos que no están en la carta y cantidades inválidas se descartan sin
 * romper el flujo.
 */
export function buildOrderLines(items: OrderIntent['items'], menuItems: MenuItemRef[]): OrderLine[] {
  const lines: OrderLine[] = [];
  for (const item of Array.isArray(items) ? items : []) {
    const productId = typeof item?.productId === 'string' ? item.productId.trim() : '';
    const quantity = Math.floor(Number(item?.quantity));
    if (!productId || !Number.isFinite(quantity) || quantity < 1) continue;
    const menuItem =
      menuItems.find((m) => m.id === productId) ??
      menuItems.find((m) => normalizeName(m.name) === normalizeName(productId));
    if (!menuItem) continue;
    lines.push({
      menuItemId: menuItem.id,
      name: menuItem.name,
      quantity,
      unitPrice: menuItem.price,
      subtotal: menuItem.price * quantity,
      ...(typeof item.notes === 'string' && item.notes.trim() ? { notes: item.notes.trim() } : {}),
    });
  }
  return lines;
}

export const orderTotal = (lines: OrderLine[]) => lines.reduce((acc, l) => acc + l.subtotal, 0);

/** Una reserva de mesa: viene al local con personas y hora */
export function isReservation(ai: OrderIntent): boolean {
  return ai.orderType === 'DINE_IN' && (ai.reservation?.people ?? 0) >= 1 && !!ai.reservation?.time?.trim();
}

/**
 * ¿Están todos los datos para pedir confirmación (o crear el pedido)?
 * Lo decide el backend además del flag de la IA, para no confirmar pedidos incompletos.
 */
export function hasRequiredData(ai: OrderIntent, lines: OrderLine[]): boolean {
  switch (ai.orderType) {
    case 'DELIVERY':
      return lines.length > 0 && !!ai.deliveryAddress?.trim();
    case 'TAKEAWAY':
      return lines.length > 0;
    case 'DINE_IN':
      // Reserva: con o sin pre-pedido de comida
      return isReservation(ai);
    default:
      return false;
  }
}

function itemsSummary(lines: OrderLine[]): string {
  return lines.map((l) => `• ${l.quantity}x ${l.name} — ${money(l.subtotal)}`).join('\n');
}

/** Domicilio y recoger se pagan en efectivo o por transferencia; la reserva de mesa, en el local */
export function needsPaymentMethod(ai: OrderIntent): boolean {
  return ai.orderType === 'DELIVERY' || ai.orderType === 'TAKEAWAY';
}

/**
 * Pregunta del método de pago cuando la IA dio el pedido por listo sin saberlo. La agrega el backend
 * para no confirmar sin método; si la IA ya lo está preguntando, no se repite.
 */
export function withPaymentMethodQuestion(ai: OrderIntent, response: string): string {
  if (/efectivo|transferencia/i.test(response)) return response;
  const when = ai.orderType === 'TAKEAWAY' ? 'al recoger' : 'al recibir';
  return `${response}\n\n¿Pagas en efectivo ${when} o por transferencia?`.trim();
}

/** Método de pago con el que se registra el pedido (los mismos valores que la web y el Kanban) */
export function toOrderPaymentMethod(ai: OrderIntent): 'CASH' | 'TRANSFERENCIA' | null {
  if (!needsPaymentMethod(ai)) return null;
  if (ai.paymentMethod === 'CASH') return 'CASH';
  return ai.paymentMethod === 'TRANSFER' ? 'TRANSFERENCIA' : null;
}

function paymentLine(ai: OrderIntent): string {
  if (ai.paymentMethod === 'TRANSFER') return 'Pago: Transferencia';
  if (ai.paymentMethod === 'CASH') return `Pago: Efectivo ${ai.orderType === 'TAKEAWAY' ? 'al recoger' : 'al recibir'}`;
  return 'Pago: por definir';
}

/** Mensaje de confirmación con el total exacto calculado por el backend y el método de pago elegido */
export function buildConfirmationMessage(
  ai: OrderIntent,
  lines: OrderLine[],
  quote?: DeliveryQuote | null,
  /** Marcas con varias sedes: dónde recoge (la elegida o la principal) */
  pickupBranchName?: string | null,
): string {
  const total = orderTotal(lines);

  if (isReservation(ai) && ai.reservation) {
    const people = Math.floor(ai.reservation.people ?? 1);
    const { time } = ai.reservation;
    const header = `📅 *Reserva de mesa* para ${people} ${people === 1 ? 'persona' : 'personas'} a las ${time}.`;
    if (lines.length === 0) {
      return `${header}\n\n¿Confirmas?`;
    }
    return `${header}\n\n*Pre-pedido:*\n${itemsSummary(lines)}\n\nTu total es ${money(total)}. Se paga en el local. ¿Confirmas?`;
  }

  if (ai.orderType === 'TAKEAWAY') {
    const where = pickupBranchName ? ` en la sede ${pickupBranchName}` : '';
    return `🛍️ *Para recoger*${where}\n${itemsSummary(lines)}\n\nTu total es ${money(total)}.\n${paymentLine(ai)}\n\n¿Confirmas?`;
  }
  // Domicilio: el sistema no conoce el valor del envío por zona; nunca se presenta como total final
  const address = [ai.deliveryAddress, ai.neighborhood?.trim()].filter(Boolean).join(', ');
  const header = `🛵 *Domicilio* a: ${address}\n${itemsSummary(lines)}`;
  if (quote?.isCovered && quote.coverageConfigured) {
    // Zona encontrada: desglose exacto de productos + domicilio
    return `${header}\n\nSubtotal: ${money(total)}\nDomicilio (${quote.zoneName}): ${money(quote.deliveryFee)}\nTotal: ${money(total + quote.deliveryFee)}\n${paymentLine(ai)}\n\n¿Confirmas?`;
  }
  return `${header}\n\nTu total en productos es ${money(total)}. ${DELIVERY_FEE_NOTE}\n${paymentLine(ai)}\n\n¿Confirmas?`;
}

/**
 * Mensaje tras registrar el pedido (el "✅" le indica a la IA que ya quedó registrado).
 * La referencia es el turno del día (#07), no el UUID: es lo que ven la cocina y el repartidor.
 */
export function buildRegisteredMessage(ai: OrderIntent, dailyNumber: number, pickupBranchName?: string | null): string {
  const ref = formatDailyNumber(dailyNumber);
  if (isReservation(ai)) {
    return `✅ Reserva confirmada. Tu turno es el ${ref}. Te esperamos.`;
  }
  return ai.orderType === 'TAKEAWAY'
    ? `✅ Pedido confirmado. Tu turno es el ${ref}. Te avisamos cuando esté listo para recoger${pickupBranchName ? ` en la sede ${pickupBranchName}` : ''}.`
    : `✅ Pedido confirmado. Tu turno es el ${ref}. Ya lo estamos preparando.`;
}

/**
 * Cómo pagar, tras registrar el pedido. Efectivo: nada de cuentas (no confundir al cliente).
 * Transferencia (o sin método): los datos de pago del local y la petición del comprobante, que el
 * bot adjunta al pedido cuando llega.
 */
export function buildPaymentInstructions(ai: OrderIntent, paymentDetails: string | null | undefined): string | null {
  if (isReservation(ai)) return null;
  if (ai.paymentMethod === 'CASH') {
    return ai.orderType === 'TAKEAWAY' ? 'Pagas en efectivo al recoger.' : 'Pagas en efectivo al recibir.';
  }
  const details = paymentDetails?.trim();
  if (!details) return 'En un momento te compartimos los datos para la transferencia.';
  return `💳 *Datos de pago:*\n${details}\n\nPor favor envíanos la captura del comprobante por aquí.`;
}

/** Notas del pedido que verá la cocina (reserva + notas por producto) */
export function buildOrderNotes(ai: OrderIntent, lines: OrderLine[]): string | undefined {
  const parts: string[] = [];
  if (isReservation(ai) && ai.reservation) {
    parts.push(`📅 RESERVA: ${Math.floor(ai.reservation.people ?? 1)} personas · ${ai.reservation.time}`);
  }
  for (const line of lines) {
    if (line.notes) parts.push(`${line.name}: ${line.notes}`);
  }
  return parts.length ? parts.join('\n') : undefined;
}

export function toPrismaOrderType(ai: OrderIntent): OrderType {
  return (ai.orderType ?? 'DELIVERY') as OrderType;
}

// ── Adición a un pedido ya registrado ("agrégame una gaseosa" justo después de confirmar) ──

/** Estados en los que todavía se le pueden sumar productos (aún no sale del local) */
export const ADD_ON_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING'] as const;
/** Ventana para tomar "agrégame..." como parte del pedido recién confirmado */
export const ADD_ON_WINDOW_MS = 60 * 60 * 1000;

export function buildAddOnConfirmationMessage(lines: OrderLine[], dailyNumber: number): string {
  return `➕ *Agregar a tu pedido ${formatDailyNumber(dailyNumber)}:*\n${itemsSummary(lines)}\n\nValor adicional: ${money(orderTotal(lines))}. ¿Confirmas?`;
}

export function buildAddOnRegisteredMessage(lines: OrderLine[], dailyNumber: number, newTotal: number): string {
  const added = lines.map((l) => `${l.quantity}x ${l.name}`).join(', ');
  return `✅ Listo, agregamos ${added} a tu pedido ${formatDailyNumber(dailyNumber)}. Nuevo total en productos: ${money(newTotal)}.`;
}

// ── "¿Cómo va mi pedido?": respuesta con el estado real de la BD (sin IA ni intento de venta) ──

export interface StatusOrder {
  status: string;
  orderType: string;
  archivedAt?: Date | null;
  driverName?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
}

export const NO_RECENT_ORDER_REPLY =
  'No encuentro un pedido reciente desde este número. Si lo hiciste desde otro teléfono, dime a nombre de quién quedó y le pido al equipo que lo revise.';

export function buildOrderStatusMessage(order: StatusOrder | null, dailyNumber: number | null): string {
  if (!order || dailyNumber === null) return NO_RECENT_ORDER_REPLY;
  const ref = `Tu pedido ${formatDailyNumber(dailyNumber)}`;
  let text: string;
  switch (order.status) {
    case 'PENDING':
    case 'CONFIRMED':
      text = `${ref} está recibido y en cola. En breve la cocina empieza a prepararlo.`;
      break;
    case 'PREPARING':
      text = `${ref} está en preparación en la cocina.`;
      break;
    case 'DELIVERED':
      if (order.archivedAt) {
        text = `${ref} ya fue entregado.`;
      } else if (order.orderType === 'DELIVERY') {
        // "En camino" solo si se despachó con repartidor (POST /orders/:id/dispatch)
        text = order.driverName
          ? `${ref} va en camino con ${order.driverName}.`
          : `${ref} está listo. Te avisamos por aquí cuando salga con el repartidor.`;
      } else if (order.orderType === 'TAKEAWAY') {
        text = `${ref} está listo para recoger.`;
      } else {
        text = `${ref} ya está listo.`;
      }
      break;
    case 'CANCELLED':
      return `${ref} fue cancelado. Si tienes alguna duda, le aviso al equipo para que te escriba.`;
    default:
      text = `${ref} está en proceso.`;
  }
  if (order.paymentMethod === 'TRANSFERENCIA' && order.paymentStatus !== 'PAID') {
    text += ' Tu pago está pendiente de validar: si aún no envías el comprobante, puedes mandarlo por aquí.';
  }
  return text;
}

// ── "Acabo de hacer el pedido #07": mensaje que la carta web prepara para WhatsApp ──

/** Referencia del pedido en el mensaje de la carta: turno del día ("#07") o código corto ("#0F8FAD5B") */
export type WebOrderReference = { dailyNumber: number } | { idPrefix: string };

export function parseWebOrderReference(text: string): WebOrderReference | null {
  const match = /acabo de hacer el pedido\s*\*?\s*#\s*([0-9a-f]+)\b/i.exec(text);
  if (!match) return null;
  const ref = match[1];
  if (/^\d{1,4}$/.test(ref)) return Number(ref) >= 1 ? { dailyNumber: Number(ref) } : null;
  return /^[0-9a-f]{8}$/i.test(ref) ? { idPrefix: ref.toLowerCase() } : null;
}

/** "Soy Ana Pérez 👋" en el mensaje de la carta */
export function nameFromWebOrderMessage(text: string): string | null {
  return /\bsoy\s+([^\n👋\uFFFD!.,]+)/i.exec(text)?.[1]?.trim() || null;
}

/** Pagos que se validan con comprobante por WhatsApp (no Wompi ni efectivo) */
const TRANSFER_METHODS = ['TRANSFERENCIA', 'NEQUI', 'DAVIPLATA'];

export interface ReceivedOrder {
  orderType: string;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
}

/**
 * Acuse del pedido hecho en la carta web: recibido y en preparación. Nunca "en camino": eso solo
 * lo avisa el despacho desde el KDS (POST /orders/:id/dispatch), con el repartidor.
 */
export function buildWebOrderReceivedMessage(
  order: ReceivedOrder,
  dailyNumber: number,
  name: string | null,
  paymentDetails?: string | null,
): string {
  const greeting = name ? `¡Hola ${name}!` : '¡Hola!';
  const next =
    order.orderType === 'TAKEAWAY'
      ? 'Te avisamos por aquí cuando esté listo para recoger.'
      : order.orderType === 'DINE_IN'
        ? 'Te avisamos por aquí cuando esté listo.'
        : 'Te notificaremos por aquí cuando salga con el repartidor.';
  let text = `${greeting} Recibimos tu pedido *${formatDailyNumber(dailyNumber)}*. 👨‍🍳 El equipo ya lo está preparando en cocina. ${next}`;
  if (order.paymentStatus !== 'PAID' && TRANSFER_METHODS.includes(order.paymentMethod ?? '')) {
    const details = paymentDetails?.trim();
    text += details
      ? `\n\n💳 *Datos de pago:*\n${details}\n\nPor favor envíanos la captura del comprobante por aquí.`
      : '\n\nEn un momento te compartimos los datos para la transferencia.';
  }
  return text;
}
