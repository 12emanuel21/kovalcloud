'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChefHat,
  Clock,
  DollarSign,
  Inbox,
  RefreshCw,
  Star,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  computeMetrics,
  latestOrders,
  type DashboardOrder,
  type OrderStatus,
  type OrderType,
} from '@/lib/orderMetrics';

const API_URL = typeof window !== 'undefined' ? '/api' : 'http://koval_backend:4000';
const AUTO_REFRESH_MS = 30_000;

const currency = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});
const relativeTime = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

function timeAgo(iso: string): string {
  const diffMin = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(diffMin) < 60) return relativeTime.format(diffMin, 'minute');
  const diffHours = Math.round(diffMin / 60);
  if (Math.abs(diffHours) < 24) return relativeTime.format(diffHours, 'hour');
  return relativeTime.format(Math.round(diffHours / 24), 'day');
}

const STATUS_STYLES: Record<OrderStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pendiente', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  CONFIRMED: { label: 'Confirmado', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  PREPARING: { label: 'En cocina', className: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
  DELIVERED: { label: 'Entregado', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  CANCELLED: { label: 'Cancelado', className: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
};

const TYPE_LABELS: Record<OrderType, string> = {
  DINE_IN: 'Mesa',
  DELIVERY: 'Domicilio',
  TAKEAWAY: 'Para llevar',
};

const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  WEB_MENU: 'Menú web',
};

/* ---------- Componentes de presentación ---------- */

interface KpiCardProps {
  label: string;
  value: string;
  hint: React.ReactNode;
  icon: LucideIcon;
  accent: 'emerald' | 'blue' | 'amber' | 'violet';
}

const ACCENTS: Record<KpiCardProps['accent'], string> = {
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  violet: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
};

function KpiCard({ label, value, hint, icon: Icon, accent }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-400">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg border ${ACCENTS[accent]}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-3 truncate text-2xl font-bold tracking-tight text-white" title={value}>
        {value}
      </p>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-950 p-5">
      <div className="flex items-start justify-between">
        <div className="h-4 w-24 rounded bg-slate-800" />
        <div className="h-9 w-9 rounded-lg bg-slate-800" />
      </div>
      <div className="mt-4 h-7 w-32 rounded bg-slate-800" />
      <div className="mt-2 h-3 w-40 rounded bg-slate-800/70" />
    </div>
  );
}

function TableSkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          {[20, 36, 24, 20, 20, 16].map((w, j) => (
            <td key={j} className="px-5 py-4">
              <div className="h-3.5 rounded bg-slate-800" style={{ width: `${w * 4}px` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/* ---------- Página ---------- */

export default function CommandCenterPage() {
  const { restaurantId, token } = useAuth();
  const [orders, setOrders] = useState<DashboardOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /** Petición pura (sin estado): la usan el efecto y el botón de actualizar */
  const loadOrders = useCallback(async (): Promise<DashboardOrder[]> => {
    const currentToken = token || localStorage.getItem('koval_token');
    const res = await fetch(`${API_URL}/orders?restaurantId=${restaurantId}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    if (!res.ok) throw new Error(`No se pudieron cargar los pedidos (${res.status})`);
    return res.json();
  }, [restaurantId, token]);

  const toErrorMessage = (err: unknown) =>
    err instanceof Error ? err.message : 'Error al conectar con la API';

  // Carga inicial + refresco silencioso (sin volver a mostrar skeletons)
  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    const run = () =>
      loadOrders()
        .then((data) => {
          if (cancelled) return;
          setOrders(data);
          setError(null);
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(toErrorMessage(err));
        });

    run();
    const interval = setInterval(run, AUTO_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loadOrders, restaurantId]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      setOrders(await loadOrders());
      setError(null);
    } catch (err: unknown) {
      setError(toErrorMessage(err));
    } finally {
      setRefreshing(false);
    }
  };

  const metrics = useMemo(() => (orders ? computeMetrics(orders) : null), [orders]);
  const recent = useMemo(() => (orders ? latestOrders(orders, 5) : []), [orders]);
  const loading = orders === null && !error;

  const delta = metrics?.salesDeltaPct;
  const salesHint =
    delta === null || delta === undefined ? (
      <span>{metrics?.ordersToday ?? 0} pedidos hoy</span>
    ) : (
      <span className={`inline-flex items-center gap-1 ${delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
        {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
        {Math.abs(delta).toFixed(0)}% vs. ayer
      </span>
    );

  return (
    <div className="space-y-6">
      {/* Barra de herramientas */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-400">Resumen en tiempo real de tu operación de hoy.</p>
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:text-white disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Actualizar</span>
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Métricas rápidas */}
      <section aria-label="Métricas rápidas" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading || !metrics ? (
          Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)
        ) : (
          <>
            <KpiCard
              label="Ventas de Hoy"
              value={currency.format(metrics.salesToday)}
              hint={salesHint}
              icon={DollarSign}
              accent="emerald"
            />
            <KpiCard
              label="Pedidos Activos"
              value={String(metrics.activeOrders)}
              hint={
                metrics.activeOrders > 0
                  ? `${metrics.preparingOrders} en cocina ahora`
                  : 'Todo al día'
              }
              icon={Clock}
              accent="amber"
            />
            <KpiCard
              label="Nuevos Clientes"
              value={String(metrics.newCustomersToday)}
              hint={`${metrics.uniqueCustomersToday} clientes únicos hoy`}
              icon={UserPlus}
              accent="blue"
            />
            <KpiCard
              label="Plato Estrella"
              value={metrics.topDish?.name ?? 'Sin ventas aún'}
              hint={
                metrics.topDish
                  ? `${metrics.topDish.quantity} unidades · últimos 7 días`
                  : 'Aparecerá con los primeros pedidos'
              }
              icon={Star}
              accent="violet"
            />
          </>
        )}
      </section>

      {/* Últimos pedidos */}
      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Últimos Pedidos</h2>
            <p className="text-xs text-slate-500">Los 5 más recientes de todos los canales</p>
          </div>
          <Link
            href="/dashboard/orders"
            className="flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300"
          >
            Ver todos <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {!loading && recent.length === 0 && !error ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-500">
              <Inbox className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-medium text-slate-300">Todavía no hay pedidos</p>
              <p className="mt-1 text-xs text-slate-500">
                Llegarán aquí desde el menú web y WhatsApp en cuanto tus clientes empiecen a pedir.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3 font-medium">Pedido</th>
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-5 py-3 font-medium">Canal</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 text-right font-medium">Total</th>
                  <th className="px-5 py-3 text-right font-medium">Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {loading ? (
                  <TableSkeletonRows />
                ) : (
                  recent.map((order) => {
                    const status = STATUS_STYLES[order.status] ?? STATUS_STYLES.PENDING;
                    const type = order.orderType ? TYPE_LABELS[order.orderType] : null;
                    return (
                      <tr key={order.id} className="transition-colors hover:bg-slate-900/60">
                        <td className="px-5 py-3.5 font-mono text-xs text-slate-400">
                          #{order.id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-slate-200">{order.customerName}</p>
                          <p className="text-xs text-slate-500">
                            {type}
                            {order.tableNumber ? ` · Mesa ${order.tableNumber}` : ''}
                          </p>
                        </td>
                        <td className="px-5 py-3.5 text-slate-400">
                          {CHANNEL_LABELS[order.channel ?? ''] ?? order.channel ?? '—'}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.className}`}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-semibold text-white">
                          {currency.format(order.total)}
                        </td>
                        <td className="px-5 py-3.5 text-right text-xs text-slate-500" title={new Date(order.createdAt).toLocaleString('es-CO')}>
                          {timeAgo(order.createdAt)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Acceso rápido a cocina cuando hay trabajo pendiente */}
      {metrics && metrics.activeOrders > 0 && (
        <Link
          href={`/kitchen/${restaurantId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 transition hover:bg-amber-500/10"
        >
          <span className="flex items-center gap-3 text-sm text-amber-300">
            <ChefHat className="h-5 w-5" />
            Hay {metrics.activeOrders} pedido{metrics.activeOrders === 1 ? '' : 's'} activo
            {metrics.activeOrders === 1 ? '' : 's'}. Abre el Monitor KDS para gestionarlos.
          </span>
          <ArrowRight className="h-4 w-4 text-amber-400" />
        </Link>
      )}
    </div>
  );
}
