import { OrderType } from '@prisma/client';
import type { OrderIntent } from '../ai/ai.service';

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
}

const money = (value: number) => `$${value.toLocaleString('es-CO')}`;

/**
 * Cruza los items de la IA con el menú de la BD. Los precios SIEMPRE salen de la BD
 * (la IA nunca fija precios). Items con IDs inexistentes se descartan.
 */
export function buildOrderLines(items: OrderIntent['items'], menuItems: MenuItemRef[]): OrderLine[] {
  const lines: OrderLine[] = [];
  for (const item of items ?? []) {
    const menuItem = menuItems.find((m) => m.id === item.productId);
    if (!menuItem || item.quantity <= 0) continue;
    lines.push({
      menuItemId: menuItem.id,
      name: menuItem.name,
      quantity: item.quantity,
      unitPrice: menuItem.price,
      subtotal: menuItem.price * item.quantity,
    });
  }
  return lines;
}

export const orderTotal = (lines: OrderLine[]) => lines.reduce((acc, l) => acc + l.subtotal, 0);

/** Una reserva de mesa: viene al local con personas y hora */
export function isReservation(ai: OrderIntent): boolean {
  return ai.orderType === 'DINE_IN' && !!ai.reservation?.people && !!ai.reservation?.time;
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

/** Mensaje de confirmación con el total exacto calculado por el backend */
export function buildConfirmationMessage(ai: OrderIntent, lines: OrderLine[]): string {
  const total = orderTotal(lines);

  if (ai.orderType === 'DINE_IN' && ai.reservation) {
    const { people, time } = ai.reservation;
    const header = `📅 *Reserva de mesa* para ${people} ${people === 1 ? 'persona' : 'personas'} a las ${time}.`;
    if (lines.length === 0) {
      return `${header}\n\n¿Confirmas?`;
    }
    return `${header}\n\n*Pre-pedido:*\n${itemsSummary(lines)}\n\nTu total es ${money(total)}. Se paga en el local. ¿Confirmas?`;
  }

  if (ai.orderType === 'TAKEAWAY') {
    return `🛍️ *Para recoger*\n${itemsSummary(lines)}\n\nTu total es ${money(total)}. Se paga al recoger. ¿Confirmas?`;
  }

  // DELIVERY
  return `🛵 *Domicilio* a: ${ai.deliveryAddress}\n${itemsSummary(lines)}\n\nTu total es ${money(total)}. Se paga al recibir. ¿Confirmas?`;
}

/** Mensaje tras registrar el pedido (el "✅" le indica a la IA que ya quedó registrado) */
export function buildRegisteredMessage(ai: OrderIntent, orderId: string): string {
  const ref = orderId.slice(0, 8).toUpperCase();
  if (isReservation(ai)) {
    return `✅ ¡Reserva confirmada! Código #${ref}. Te esperamos 🙌`;
  }
  return ai.orderType === 'TAKEAWAY'
    ? `✅ ¡Pedido confirmado! #${ref}. Te avisamos cuando esté listo para recoger.`
    : `✅ ¡Pedido confirmado! #${ref}. Ya lo estamos preparando 👨‍🍳`;
}

/** Notas del pedido que verá la cocina (reserva + notas por producto) */
export function buildOrderNotes(ai: OrderIntent, lines: OrderLine[]): string | undefined {
  const parts: string[] = [];
  if (isReservation(ai) && ai.reservation) {
    parts.push(`📅 RESERVA: ${ai.reservation.people} personas · ${ai.reservation.time}`);
  }
  for (const item of ai.items ?? []) {
    const line = lines.find((l) => l.menuItemId === item.productId);
    if (line && item.notes?.trim()) parts.push(`${line.name}: ${item.notes.trim()}`);
  }
  return parts.length ? parts.join('\n') : undefined;
}

export function toPrismaOrderType(ai: OrderIntent): OrderType {
  return (ai.orderType ?? 'DELIVERY') as OrderType;
}
