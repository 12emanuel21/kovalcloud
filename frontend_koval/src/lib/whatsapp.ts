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
 * Enlace para abrir el chat con el texto precargado. Va directo a api.whatsapp.com/send: wa.me
 * redirige ahí y en esa redirección algunos clientes (WhatsApp Web / escritorio) vuelven a
 * codificar el texto y los emojis de 4 bytes (🛵 📍 💰) llegan como "�". El texto se normaliza
 * (NFC) y se codifica una sola vez en UTF-8.
 */
export function whatsappLink(number: string, text?: string): string {
  const params = [`phone=${number}`];
  if (text) params.push(`text=${encodeURIComponent(text.normalize('NFC'))}`);
  return `https://api.whatsapp.com/send?${params.join('&')}`;
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
  tableNumber?: string;
  notes?: string;
}

/** Mensaje que el cliente envía al local al confirmar un pedido en efectivo / contra entrega */
export function buildOrderWhatsAppMessage(order: OrderWhatsAppDetails): string {
  const lines = [
    `¡Hola${order.restaurantName ? ` ${order.restaurantName}` : ''}! Soy ${order.customerName} 👋`,
    `Acabo de hacer el pedido *${orderNumberLabel({ id: order.orderId, dailyNumber: order.dailyNumber })}*:`,
    '',
    ...order.items.map((item) => `• ${item.quantity}x ${item.name} — ${formatCOP(item.price * item.quantity)}`),
    '',
  ];
  if (order.tableNumber) lines.push(`🍽️ Mesa: ${order.tableNumber}`);
  else if (order.pickup) lines.push('🛍️ Para recoger en el local');
  else if (order.deliveryAddress || order.neighborhood) {
    lines.push(`📍 Dirección: ${[order.deliveryAddress, order.neighborhood].filter(Boolean).join(', ')}`);
  }
  if (order.deliveryFee) lines.push(`🛵 Domicilio: ${formatCOP(order.deliveryFee)}`);
  if (order.notes) lines.push(`📝 Notas: ${order.notes}`);
  lines.push(`💰 *Total a pagar: ${formatCOP(order.total)} COP* (efectivo / contra entrega)`);
  return lines.join('\n');
}
