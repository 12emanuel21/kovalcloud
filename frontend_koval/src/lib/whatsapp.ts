import { orderNumberLabel } from './order-number';

/**
 * WhatsApp del local en la carta pública.
 * WhatsApp exige el número internacional solo con dígitos: sin indicativo ("3001234567") o vacío
 * el enlace no llega al local (WhatsApp abre el selector de chats).
 */

/** Igual que el backend (toWhatsAppNumber): celular colombiano de 10 dígitos -> 57XXXXXXXXXX */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '').replace(/^00/, '');
  if (!digits) return null;
  const normalized = digits.startsWith('57') || !(digits.length === 10 && digits.startsWith('3')) ? digits : `57${digits}`;
  return /^\d{10,15}$/.test(normalized) ? normalized : null;
}

/**
 * Texto apto para el parámetro text de WhatsApp. Los servidores de Meta (api.whatsapp.com, wa.me y
 * la carga del texto en WhatsApp Web / escritorio) dañan los caracteres fuera del plano básico
 * (emojis de 4 bytes como 🛵 📍 💰 👋) y llegan como "�"; los de 3 bytes (• — ñ) llegan bien.
 * Se quitan esos caracteres junto con sus uniones (ZWJ) y selectores de variante, y se ordenan
 * los espacios que dejan.
 */
export function toWhatsAppSafeText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/[\u200D\uFE0F]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/^[ \t]+/gm, '');
}

/** Teléfono o tablet (iPadOS se presenta como "Macintosh": se reconoce por la pantalla táctil) */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

/**
 * Enlace para abrir el chat con el texto precargado.
 * - Móvil: api.whatsapp.com/send abre la app.
 * - Escritorio: directo a web.whatsapp.com/send. api.whatsapp.com redirige ahí en escritorio y en
 *   esa redirección del servidor los emojis de 4 bytes (🛵 📍 💰) se truncan y llegan como "�".
 * El texto pasa por toWhatsAppSafeText y se codifica una sola vez (encodeURIComponent = UTF-8).
 * `mobile` se calcula en el navegador al llamar; los enlaces renderizados en servidor deben
 * pasarlo explícitamente (useIsMobileDevice) para no desajustar la hidratación.
 */
export function whatsappLink(number: string, text?: string, mobile: boolean = isMobileDevice()): string {
  const params = [`phone=${number}`];
  const safeText = text ? toWhatsAppSafeText(text) : '';
  if (safeText) params.push(`text=${encodeURIComponent(safeText)}`);
  const host = mobile ? 'https://api.whatsapp.com' : 'https://web.whatsapp.com';
  return `${host}/send?${params.join('&')}`;
}

const formatCOP = (value: number) => `$${value.toLocaleString('es-CO')}`;

export interface OrderWhatsAppDetails {
  orderId: string;
  /** Turno del día (#07), la misma referencia que ven el Kanban y el repartidor */
  dailyNumber?: number | null;
  restaurantName?: string;
  customerName: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  /** Valor del domicilio según la zona (incluido en total) */
  deliveryFee?: number;
  deliveryAddress?: string;
  neighborhood?: string;
  /** Pasa a recoger en el local */
  pickup?: boolean;
  /** Sede donde recoge (marcas con varias sedes) */
  pickupBranch?: string;
  tableNumber?: string;
  notes?: string;
}

/** Mensaje que el cliente envía al local al confirmar un pedido en efectivo / contra entrega */
export function buildOrderWhatsAppMessage(order: OrderWhatsAppDetails): string {
  const lines = [
    `¡Hola${order.restaurantName ? ` ${order.restaurantName}` : ''}! Soy ${order.customerName}.`,
    `Acabo de hacer el pedido *${orderNumberLabel({ id: order.orderId, dailyNumber: order.dailyNumber })}*:`,
    '',
    ...order.items.map((item) => `• ${item.quantity}x ${item.name} — ${formatCOP(item.price * item.quantity)}`),
    '',
  ];
  if (order.tableNumber) lines.push(`Mesa: ${order.tableNumber}`);
  else if (order.pickup) lines.push(order.pickupBranch ? `Para recoger en la sede ${order.pickupBranch}` : 'Para recoger en el local');
  else if (order.deliveryAddress || order.neighborhood) {
    lines.push(`Dirección: ${[order.deliveryAddress, order.neighborhood].filter(Boolean).join(', ')}`);
  }
  if (order.deliveryFee) lines.push(`Domicilio: ${formatCOP(order.deliveryFee)}`);
  if (order.notes) lines.push(`Notas: ${order.notes}`);
  lines.push(`*Total a pagar: ${formatCOP(order.total)} COP* (efectivo / contra entrega)`);
  return lines.join('\n');
}
