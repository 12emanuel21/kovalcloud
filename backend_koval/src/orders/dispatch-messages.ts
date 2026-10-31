/**
 * Mensajes de WhatsApp del despacho a domicilio (POST /orders/:id/dispatch): al cliente con los
 * datos del repartidor y un wa.me para escribirle, y al repartidor con lo que necesita para entregar.
 */
export interface DispatchDriver {
  name: string;
  phone: string; // dígitos con indicativo
  vehicle: string | null;
}

export interface DispatchOrder {
  id: string;
  customerName: string;
  customerPhone: string; // dígitos con indicativo
  deliveryAddress: string | null;
  notes: string | null;
  total: number;
  paymentStatus: string;
  items: Array<{ quantity: number; menuItem: { name: string } | null }>;
}

/** Sin minutos: la franja típica de un domicilio */
export const DEFAULT_ETA = '15-20';

export const shortOrderId = (id: string) => id.slice(0, 8).toUpperCase();
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name.trim();
const waLink = (phone: string, text: string) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
const formatCOP = (value: number) => `$${value.toLocaleString('es-CO')}`;

export function buildCustomerDispatchMessage(
  order: DispatchOrder,
  driver: DispatchDriver,
  restaurantName: string,
  estimatedMinutes?: number,
): string {
  const ref = shortOrderId(order.id);
  const greeting = `Hola ${firstName(driver.name)}, soy ${firstName(order.customerName)}. Te escribo por mi pedido #${ref} de ${restaurantName}.`;
  return [
    `🛵 ¡Tu pedido *#${ref}* de ${restaurantName} va en camino!`,
    '',
    `👤 Repartidor: *${driver.name}*`,
    ...(driver.vehicle ? [`🏍️ Vehículo: ${driver.vehicle}`] : []),
    `⏱️ Llega en aprox. ${estimatedMinutes ?? DEFAULT_ETA} minutos.`,
    '',
    '¿Necesitas indicarle algo? Escríbele aquí:',
    waLink(driver.phone, greeting),
  ].join('\n');
}

export function buildDriverDispatchMessage(order: DispatchOrder, driver: DispatchDriver, restaurantName: string): string {
  const ref = shortOrderId(order.id);
  const address = order.deliveryAddress?.trim();
  const toCustomer = `Hola ${firstName(order.customerName)}, soy ${firstName(driver.name)}, el repartidor de ${restaurantName}. Voy en camino con tu pedido #${ref}.`;
  const paid = order.paymentStatus === 'PAID';
  return [
    `📦 *Domicilio · ${restaurantName} · Pedido #${ref}*`,
    '',
    `👤 Cliente: ${order.customerName}`,
    `💬 Escríbele: ${waLink(order.customerPhone, toCustomer)}`,
    `📍 Dirección: ${address || 'Sin dirección (confirmar con el cliente)'}`,
    ...(address ? [`🗺️ ${`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}`] : []),
    '',
    '🧾 Pedido:',
    ...order.items.map((item) => `• ${item.quantity}x ${item.menuItem?.name ?? 'Producto'}`),
    '',
    paid ? '✅ *Pagado en línea:* no cobrar.' : `💵 *Cobrar al entregar:* ${formatCOP(order.total)} COP`,
    ...(order.notes?.trim() ? ['', `📝 Notas: ${order.notes.trim()}`] : []),
  ].join('\n');
}
