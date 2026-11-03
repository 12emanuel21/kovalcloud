import { RESTAURANT_TIMEZONE } from '../restaurants/business-hours';

/**
 * Turno del día: número corto y consecutivo de cada pedido dentro de la jornada del local
 * (#01, #02...), para que el cliente, la cocina y el domiciliario se guíen sin el UUID.
 * No se guarda: se calcula contando los pedidos del restaurante en la jornada, así no hay
 * carreras entre pedidos simultáneos ni migración.
 *
 * La jornada arranca a las 5:00 (hora del local): un pedido de la 1:00 a. m. sigue siendo
 * del turno de esa noche, no el #01 del día siguiente.
 */
export const BUSINESS_DAY_START_HOUR = 5;

/** Minutos de diferencia entre la hora local del restaurante y UTC en ese instante */
function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return Math.round((asUtc - Math.floor(date.getTime() / 60_000) * 60_000) / 60_000);
}

/** Inicio (UTC) de la jornada a la que pertenece `date` */
export function businessDayStart(date: Date, timeZone = RESTAURANT_TIMEZONE): Date {
  const offset = timeZoneOffsetMinutes(date, timeZone);
  // Hora local expresada como si fuera UTC, corrida para que la jornada empiece a medianoche
  const shifted = new Date(date.getTime() + (offset - BUSINESS_DAY_START_HOUR * 60) * 60_000);
  const startShifted = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(startShifted - (offset - BUSINESS_DAY_START_HOUR * 60) * 60_000);
}

/** "#07" (dos dígitos mínimo) */
export const formatDailyNumber = (n: number) => `#${String(n).padStart(2, '0')}`;

type Numberable = { id: string; restaurantId: string; createdAt: Date };

/**
 * Numera en memoria una lista que contiene TODOS los pedidos de sus jornadas (p. ej. el Kanban,
 * que lista todos los pedidos del local): orden de creación dentro de cada restaurante y jornada.
 */
export function withDailyNumbers<T extends Numberable>(orders: T[]): Array<T & { dailyNumber: number }> {
  const byDay = new Map<string, T[]>();
  for (const order of orders) {
    const key = `${order.restaurantId}|${businessDayStart(order.createdAt).getTime()}`;
    const group = byDay.get(key) ?? [];
    group.push(order);
    byDay.set(key, group);
  }
  const numbers = new Map<string, number>();
  for (const group of byDay.values()) {
    group
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
      .forEach((order, index) => numbers.set(order.id, index + 1));
  }
  return orders.map((order) => ({ ...order, dailyNumber: numbers.get(order.id)! }));
}

/** Prisma mínimo para contar los pedidos de la jornada */
export interface OrderCounter {
  order: { count(args: { where: { restaurantId: string; createdAt: { gte: Date; lt: Date } } }): Promise<number> };
}

/** Turno de un pedido suelto: pedidos del local en su jornada creados antes que él, +1 */
export async function dailyNumberOf(prisma: OrderCounter, order: Numberable): Promise<number> {
  const before = await prisma.order.count({
    where: { restaurantId: order.restaurantId, createdAt: { gte: businessDayStart(order.createdAt), lt: order.createdAt } },
  });
  return before + 1;
}
