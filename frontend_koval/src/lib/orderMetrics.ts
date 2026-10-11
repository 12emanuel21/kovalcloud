export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'DELIVERED' | 'CANCELLED';
export type OrderType = 'DINE_IN' | 'DELIVERY' | 'TAKEAWAY';

export interface DashboardOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  total: number;
  status: OrderStatus;
  orderType?: OrderType;
  channel?: string | null;
  tableNumber?: string | null;
  createdAt: string;
  items: { quantity: number; menuItem?: { name: string } | null }[];
}

export interface DashboardMetrics {
  salesToday: number;
  /** Variación % frente a ayer; null si ayer no hubo ventas */
  salesDeltaPct: number | null;
  ordersToday: number;
  activeOrders: number;
  preparingOrders: number;
  newCustomersToday: number;
  uniqueCustomersToday: number;
  topDish: { name: string; quantity: number } | null;
}

/** Estados que todavía requieren atención de la cocina */
const ACTIVE_STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING'];
const TOP_DISH_WINDOW_DAYS = 7;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Calcula los KPIs del Centro de Mando a partir de los pedidos (hora local del navegador) */
export function computeMetrics(orders: DashboardOrder[], now: Date = new Date()): DashboardMetrics {
  const todayStart = startOfDay(now).getTime();
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const topDishSince = todayStart - (TOP_DISH_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000;

  let salesToday = 0;
  let salesYesterday = 0;
  let ordersToday = 0;
  let activeOrders = 0;
  let preparingOrders = 0;
  const firstOrderByPhone = new Map<string, number>();
  const customersToday = new Set<string>();
  const dishQuantities = new Map<string, number>();

  for (const order of orders) {
    const createdAt = new Date(order.createdAt).getTime();
    const cancelled = order.status === 'CANCELLED';

    if (ACTIVE_STATUSES.includes(order.status)) activeOrders++;
    if (order.status === 'PREPARING') preparingOrders++;

    const phone = order.customerPhone?.trim();
    if (phone) {
      const prev = firstOrderByPhone.get(phone);
      if (prev === undefined || createdAt < prev) firstOrderByPhone.set(phone, createdAt);
      if (createdAt >= todayStart) customersToday.add(phone);
    }

    if (cancelled) continue;

    if (createdAt >= todayStart) {
      salesToday += order.total;
      ordersToday++;
    } else if (createdAt >= yesterdayStart) {
      salesYesterday += order.total;
    }

    if (createdAt >= topDishSince) {
      for (const item of order.items ?? []) {
        const name = item.menuItem?.name;
        if (name) dishQuantities.set(name, (dishQuantities.get(name) ?? 0) + item.quantity);
      }
    }
  }

  let newCustomersToday = 0;
  for (const first of firstOrderByPhone.values()) {
    if (first >= todayStart) newCustomersToday++;
  }

  let topDish: DashboardMetrics['topDish'] = null;
  for (const [name, quantity] of dishQuantities) {
    if (!topDish || quantity > topDish.quantity) topDish = { name, quantity };
  }

  return {
    salesToday,
    salesDeltaPct: salesYesterday > 0 ? ((salesToday - salesYesterday) / salesYesterday) * 100 : null,
    ordersToday,
    activeOrders,
    preparingOrders,
    newCustomersToday,
    uniqueCustomersToday: customersToday.size,
    topDish,
  };
}

export function latestOrders(orders: DashboardOrder[], limit = 5): DashboardOrder[] {
  return [...orders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
