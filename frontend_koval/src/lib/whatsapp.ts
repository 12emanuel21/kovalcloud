/**
 * WhatsApp del local en la carta pública (wa.me/<número>).
 * wa.me exige el número internacional solo con dígitos: sin indicativo ("3107382726") o vacío
 * ("wa.me/?text=…") el enlace no llega al local (WhatsApp abre el selector de chats).
 */

/** Igual que el backend (toWhatsAppNumber): celular colombiano de 10 dígitos -> 57XXXXXXXXXX */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '').replace(/^00/, '');
  if (!digits) return null;
  const normalized = digits.startsWith('57') || !(digits.length === 10 && digits.startsWith('3')) ? digits : `57${digits}`;
  return /^\d{10,15}$/.test(normalized) ? normalized : null;
}

export function whatsappLink(number: string, text?: string): string {
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** "f2796cc8-fa48-…" -> "F2796CC8" (la misma referencia corta que usa el bot y el Kanban) */
export const shortOrderId = (id: string) => id.slice(0, 8).toUpperCase();

const formatCOP = (value: number) => `$${value.toLocaleString('es-CO')}`;

export interface OrderWhatsAppDetails {
  orderId: string;
  restaurantName?: string;
  customerName: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  deliveryAddress?: string;
  tableNumber?: string;
  notes?: string;
}

/** Mensaje que el cliente envía al local al confirmar un pedido en efectivo / contra entrega */
export function buildOrderWhatsAppMessage(order: OrderWhatsAppDetails): string {
  const lines = [
    `¡Hola${order.restaurantName ? ` ${order.restaurantName}` : ''}! Soy ${order.customerName} 👋`,
    `Acabo de hacer el pedido *#${shortOrderId(order.orderId)}*:`,
    '',
    ...order.items.map((item) => `• ${item.quantity}x ${item.name} — ${formatCOP(item.price * item.quantity)}`),
    '',
  ];
  if (order.tableNumber) lines.push(`🍽️ Mesa: ${order.tableNumber}`);
  else if (order.deliveryAddress) lines.push(`📍 Dirección: ${order.deliveryAddress}`);
  if (order.notes) lines.push(`📝 Notas: ${order.notes}`);
  lines.push(`💰 *Total a pagar: ${formatCOP(order.total)} COP* (efectivo / contra entrega)`);
  return lines.join('\n');
}
