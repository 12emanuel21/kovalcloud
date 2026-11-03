/**
 * Turno del día de un pedido (#07): número corto consecutivo por restaurante y jornada que calcula
 * el backend (orders/daily-number.ts). Es la referencia para el cliente, la cocina y el repartidor.
 * Sin turno (datos viejos en memoria) se usa el inicio del UUID.
 */
export function orderNumberLabel(order: { id: string; dailyNumber?: number | null }): string {
  return order.dailyNumber ? `#${String(order.dailyNumber).padStart(2, '0')}` : `#${order.id.slice(0, 8).toUpperCase()}`;
}
