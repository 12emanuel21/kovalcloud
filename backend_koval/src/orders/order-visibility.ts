import { Role } from '@prisma/client';

/**
 * Blindaje financiero para el rol KITCHEN: la cocina ve qué preparar, nunca cuánto vale.
 * Los importes se envían como null (no 0) para que el frontend los oculte en vez de mostrar "$0".
 */

type WithMoney = Record<string, any>;

function redactItem(item: WithMoney): WithMoney {
  return {
    ...item,
    unitPrice: null,
    subtotal: null,
    ...(item.menuItem ? { menuItem: { ...item.menuItem, price: null } } : {}),
  };
}

/** Copia del pedido sin ningún campo monetario (pedido, líneas y producto) */
export function redactOrderFinancials<T extends WithMoney>(order: T): T {
  if (!order || typeof order !== 'object') return order;
  return {
    ...order,
    total: null,
    ...(Array.isArray(order.items) ? { items: order.items.map(redactItem) } : {}),
  };
}

/** Aplica el blindaje solo si quien consulta es KITCHEN (acepta un pedido o una lista) */
export function orderViewFor<T>(role: Role | string | undefined, data: T): T {
  if (role !== Role.KITCHEN) return data;
  return (Array.isArray(data) ? data.map(redactOrderFinancials) : redactOrderFinancials(data as WithMoney)) as T;
}
