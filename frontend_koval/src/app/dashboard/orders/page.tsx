'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ExportOrdersButton } from '@/components/orders/ExportOrdersButton';
import { ShiftExtensionPanel } from '@/components/orders/ShiftExtensionPanel';
import { io, Socket } from 'socket.io-client';
import PrepareActions from '@/components/orders/PrepareActions';
import DispatchModal from '@/components/orders/DispatchModal';
import PaymentProofModal from '@/components/orders/PaymentProofModal';
import { formatCustomerPhone, isLidContact, waPhone } from '@/lib/customer-phone';
import { orderNumberLabel } from '@/lib/order-number';
import { branchNameOf, hasMultipleBranches, useBranches } from '../settings/useBranches';

type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'DELIVERED' | 'CANCELLED';

type OrderType = 'DINE_IN' | 'DELIVERY' | 'TAKEAWAY';

interface OrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  quantity: number;
  // null para el rol KITCHEN: el backend no envía importes a la cocina
  unitPrice: number | null;
  subtotal: number | null;
  menuItem?: {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
  };
}

interface Order {
  id: string;
  restaurantId: string;
  /** Turno del día (#07): referencia corta para la cocina, el domiciliario y el cliente */
  dailyNumber?: number;
  orderType?: OrderType;
  tableNumber?: string;
  channel?: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string;
  /** Repartidor que lo lleva (despacho a domicilio) */
  driverName?: string | null;
  total: number | null;
  status: OrderStatus;
  notes?: string;
  /** Pago en línea (Wompi): PENDING, PAID, FAILED, CANCELLED */
  paymentStatus?: string;
  paymentReference?: string | null;
  paymentMethod?: string | null;
  /** Comprobante enviado por WhatsApp (archivo del chat) y cuándo llegó */
  paymentProofUrl?: string | null;
  paymentProofAt?: string | null;
  /** Entregado / archivado: ya no va en el tablero activo */
  archivedAt?: string | null;
  /** Sede que lo prepara (multisede); los eventos en vivo traen solo el id */
  branchId?: string | null;
  branch?: { name: string } | null;
  /** Pin GPS del cliente y distancia con la que se cobró el envío */
  customerLat?: number | null;
  customerLng?: number | null;
  deliveryDistanceKm?: number | null;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

const API_URL = typeof window !== "undefined" ? "/api" : "http://koval_backend:4000";
const SOCKET_URL =
  typeof window === "undefined"
    ? API_URL
    : window.location.port === "3030"
      ? `${window.location.protocol}//${window.location.hostname}:4000` // acceso directo sin Nginx
      : "/"; // detrás de Nginx (puerto 80) -> /socket.io/ proxificado

// Reproduce un timbre/chime sonoro para la cocina usando Web Audio API
const playOrderChime = () => {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Tono 1 (880 Hz - Nota La5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    gain1.gain.setValueAtTime(0.4, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.9);

    // Tono 2 (1320 Hz - Nota Mi6 campana brillante)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.18);
    gain2.gain.setValueAtTime(0.45, ctx.currentTime + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.4);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.18);
    osc2.stop(ctx.currentTime + 1.4);
  } catch (e) {
    console.warn('Audio notification error:', e);
  }
};

type KanbanColumnId = 'pending' | 'preparing' | 'delivered';

/** Columnas del tablero: en escritorio se ven las 3; en móvil y tablet, una a la vez con pestañas */
const KANBAN_COLUMNS: Array<{
  id: KanbanColumnId;
  title: string;
  /** Nombre corto para la pestaña móvil */
  tab: string;
  empty: string;
  dot: string;
  badge: string;
}> = [
  {
    id: 'pending',
    title: 'Pendientes',
    tab: 'Pendientes',
    empty: 'No hay pedidos pendientes',
    dot: 'bg-amber-400 animate-pulse',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  {
    id: 'preparing',
    title: 'En Preparación',
    tab: 'Preparando',
    empty: 'No hay pedidos en preparación',
    dot: 'bg-blue-400',
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  {
    id: 'delivered',
    title: 'Listos / Despachados',
    tab: 'Listos',
    empty: 'No hay pedidos despachados',
    dot: 'bg-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
];

/** Botón secundario de la tarjeta (WhatsApp, mapa, comprobante): 44 px de alto para el dedo */
const quickActionClass =
  'inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition';

export default function OrdersPage() {
  const { restaurantId, token, logout } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  // Pedido cuyo comprobante se está revisando
  const [proofOrderId, setProofOrderId] = useState<string | null>(null);
  // Domicilio listo: el mismo modal del KDS para elegir repartidor
  const [dispatchOrder, setDispatchOrder] = useState<Order | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Multisede: filtro por sede ('' = todas). Sin sedes no se muestra nada nuevo
  const { branches } = useBranches();
  const [branchFilter, setBranchFilter] = useState('');
  // Con una sola sede no se muestra ni el filtro ni la etiqueta de sede (todo es el mismo local)
  const multiBranch = hasMultipleBranches(branches);
  const singleBranch = branches.length === 1;
  // Columna visible en móvil y tablet (en escritorio se ven las 3)
  const [mobileColumn, setMobileColumn] = useState<KanbanColumnId>('pending');
  const [isConnectedWs, setIsConnectedWs] = useState<boolean>(false);
  const [newOrderToast, setNewOrderToast] = useState<{ id: string; customer: string; total: number | null } | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Cargar pedidos desde la API REST
  const fetchOrders = useCallback(async (showLoader = false) => {
    if (!restaurantId) return;
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const currentToken = token || (typeof window !== 'undefined' ? localStorage.getItem('koval_token') : null);
      const res = await fetch(`${API_URL}/orders?restaurantId=${restaurantId}`, {
        cache: 'no-store',
        headers: { Authorization: 'Bearer ' + currentToken },
      });
      if (!res.ok) {
        throw new Error(`Error ${res.status}: No se pudieron cargar los pedidos`);
      }
      const data: Order[] = await res.json();
      setOrders(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al conectar con la API de pedidos';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, token]);

  // Carga inicial
  useEffect(() => {
    if (restaurantId) {
      fetchOrders(true);
    }
  }, [fetchOrders, restaurantId]);

  // Conexión WebSockets con Socket.io
  useEffect(() => {
    if (!restaurantId) return;

    const socket = io(SOCKET_URL, {
      path: "/socket.io/",
      transports: ['websocket', 'polling'],
      // El gateway rechaza conexiones sin JWT válido
      auth: { token: token || (typeof window !== 'undefined' ? localStorage.getItem('koval_token') : '') },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnectedWs(true);
      socket.emit('join_restaurant', { restaurantId });
    });

    socket.on('disconnect', () => {
      setIsConnectedWs(false);
    });

    // El backend expulsa el socket si el acceso fue desactivado (Ajustes > Equipo): cerrar sesión
    socket.on('unauthorized', () => logout());

    // Escuchar nuevas órdenes
    const handleNewOrder = (newOrder: Order) => {
      if (newOrder.restaurantId === restaurantId) {
        // Reproducir sonido de alerta
        playOrderChime();

        // Mostrar notificación flotante
        setNewOrderToast({
          id: orderNumberLabel(newOrder),
          customer: newOrder.customerName,
          total: newOrder.total,
        });
        setTimeout(() => setNewOrderToast(null), 6000);

        // Agregar la orden reactivamente al principio de la lista
        setOrders((prev) => {
          const exists = prev.some((o) => o.id === newOrder.id);
          if (exists) return prev;
          return [newOrder, ...prev];
        });
      }
    };

    // Escuchar actualizaciones de órdenes
    const handleOrderUpdated = (updatedOrder: Order) => {
      if (updatedOrder.restaurantId === restaurantId) {
        setOrders((prev) =>
          updatedOrder.archivedAt
            ? prev.filter((ord) => ord.id !== updatedOrder.id)
            : prev.map((ord) => (ord.id === updatedOrder.id ? { ...ord, ...updatedOrder } : ord))
        );
      }
    };

    socket.on('new_order', handleNewOrder);
    socket.on('order_updated', handleOrderUpdated);
    socket.on('order_status_updated', handleOrderUpdated);
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [restaurantId, token, logout]);

  // Actualizar estado del pedido (PATCH a /orders/:id/status)
  // estimatedMinutes: al pasar a PREPARING el backend avisa al cliente por WhatsApp con ese tiempo
  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus, estimatedMinutes?: number) => {
    setUpdatingOrderId(orderId);
    try {
      const currentToken = token || (typeof window !== 'undefined' ? localStorage.getItem('koval_token') : null);
      const res = await fetch(`${API_URL}/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer ' + currentToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus, estimatedMinutes }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `No se pudo actualizar el pedido (${res.status})`);
      }

      const updatedOrder: Order = await res.json();

      setOrders((prev) =>
        prev.map((ord) => (ord.id === orderId ? { ...ord, status: updatedOrder.status } : ord))
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al cambiar estado del pedido');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // "Entregado / Archivar": el pedido despachado sale del tablero (sigue en la BD y en el Excel)
  const handleArchive = async (orderId: string) => {
    setUpdatingOrderId(orderId);
    try {
      const currentToken = token || (typeof window !== 'undefined' ? localStorage.getItem('koval_token') : null);
      const res = await fetch(`${API_URL}/orders/${orderId}/archive`, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + currentToken },
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `No se pudo archivar el pedido (${res.status})`);
      }
      setOrders((prev) => prev.filter((ord) => ord.id !== orderId));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al archivar el pedido');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // Filtrado por buscador
  const filterBySearch = (allOrders: Order[]) => {
    const list = branchFilter ? allOrders.filter((o) => o.branchId === branchFilter) : allOrders;
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    // "7", "#7" o "#07": busca por turno del día
    const turn = /^#?\d{1,3}$/.test(q) ? Number(q.replace('#', '')) : null;
    return list.filter(
      (o) =>
        (turn !== null && o.dailyNumber === turn) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.customerPhone?.includes(q) ||
        o.id?.toLowerCase().includes(q)
    );
  };

  // Órdenes distribuidas en las 3 columnas del Kanban
  const pendingOrders = filterBySearch(orders.filter((o) => o.status === 'PENDING'));
  const preparingOrders = filterBySearch(orders.filter((o) => o.status === 'PREPARING'));
  const deliveredOrders = filterBySearch(
    orders.filter((o) => o.status === 'DELIVERED' || (o.status as string) === 'READY')
  );
  const columnOrders: Record<KanbanColumnId, Order[]> = {
    pending: pendingOrders,
    preparing: preparingOrders,
    delivered: deliveredOrders,
  };

  const formatOrderTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  /** Etiqueta de pago: PAGADO (verde brillante) o PAGO PENDIENTE (ámbar si espera a Wompi, gris si no) */
  const renderPaymentBadge = (order: Order) => {
    const base = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black tracking-wide';
    switch (order.paymentStatus) {
      case 'PAID':
        return (
          <span
            className={`${base} bg-emerald-400 text-slate-950 shadow-[0_0_12px_rgba(52,211,153,0.45)]`}
            title={order.paymentMethod ? `Pagado con ${order.paymentMethod}` : 'Pagado en línea'}
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6 9 17l-5-5" />
            </svg>
            PAGADO{order.paymentMethod ? ` · ${order.paymentMethod}` : ''}
          </span>
        );
      case 'FAILED':
        return <span className={`${base} bg-rose-500/15 text-rose-300 border border-rose-500/30`}>PAGO RECHAZADO</span>;
      case 'CANCELLED':
        return <span className={`${base} bg-slate-700/60 text-slate-300 border border-slate-600`}>PAGO ANULADO</span>;
      default:
        // Con referencia = el cliente abrió el checkout de Wompi y aún no se confirma
        return order.paymentReference ? (
          <span className={`${base} bg-amber-500/15 text-amber-300 border border-amber-500/30`} title="Esperando confirmación de Wompi">
            PAGO PENDIENTE
          </span>
        ) : (
          <span className={`${base} bg-slate-700/50 text-slate-400 border border-slate-600/60`} title="Sin pago en línea registrado">
            PAGO PENDIENTE
          </span>
        );
    }
  };

  // Render de tarjeta de orden
  const renderOrderCard = (order: Order) => {
    const isUpdating = updatingOrderId === order.id;
    const turn = orderNumberLabel(order);
    const cleanPhone = waPhone(order.customerPhone);
    const isWhatsApp = order.channel === 'WHATSAPP';
    const branchName =
      order.branchId && !singleBranch ? order.branch?.name ?? branchNameOf(branches, order.branchId, '') : '';
    const hasGps = order.orderType !== 'DINE_IN' && order.customerLat != null && order.customerLng != null;

    return (
      <div
        key={order.id}
        className="bg-slate-800 rounded-lg p-4 shadow-lg border border-slate-700 mb-4 flex flex-col gap-3 transition-all hover:border-slate-600"
      >
        {/* Cabecera del Ticket: el cliente es lo más visible; el ID queda como referencia discreta */}
        <div className="flex items-start justify-between gap-2 border-b border-slate-700/70 pb-2.5">
          <div className="min-w-0">
            <h3 className="text-lg font-black leading-tight text-white truncate" title={order.customerName}>
              {order.customerName || 'Cliente'}
            </h3>
            <div className="mt-1 flex items-center gap-2">
              {isWhatsApp ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span>WA</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <span>Web</span>
                </span>
              )}
              <span className="text-[11px] text-slate-400">{formatOrderTime(order.createdAt)}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {branchName && (
                <span
                  className="inline-flex max-w-full items-center truncate rounded border border-slate-600/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300"
                  title={`Sede ${branchName}`}
                >
                  📍 {branchName}
                </span>
              )}
              {renderPaymentBadge(order)}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <span
              className="block rounded-md bg-slate-900/80 px-2 py-0.5 font-mono text-sm font-black text-amber-300"
              title={`Pedido ${order.id}`}
            >
              Turno {turn}
            </span>
            {order.total != null && (
              <span className="font-mono text-base font-black text-emerald-400">
                ${order.total.toLocaleString('es-CO')}
              </span>
            )}
          </div>
        </div>

        {/* Cliente: la dirección completa se lee de un vistazo (sin depender del hover) */}
        <div className="space-y-1.5">
          {order.customerPhone && (
            <p className="font-mono text-xs text-slate-400">
              {isLidContact(order.customerPhone) ? formatCustomerPhone(order.customerPhone) : order.customerPhone}
            </p>
          )}
          {order.orderType === 'DINE_IN' && order.tableNumber ? (
            <p className="text-sm font-semibold text-indigo-400">🍽️ Mesa: {order.tableNumber}</p>
          ) : order.deliveryAddress ? (
            <p className="whitespace-normal break-words text-sm leading-snug text-slate-200">📍 {order.deliveryAddress}</p>
          ) : null}
        </div>

        {/* Acciones rápidas: WhatsApp, mapa del pin y comprobante */}
        {(cleanPhone || hasGps || order.paymentProofUrl) && (
          <div className="flex flex-wrap gap-2">
            {cleanPhone && (
              <a
                href={`https://wa.me/${cleanPhone}`}
                target="_blank"
                rel="noreferrer"
                className={`${quickActionClass} border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20`}
                title="Abrir chat en WhatsApp"
              >
                WhatsApp <span className="font-mono" aria-hidden>↗</span>
              </a>
            )}
            {hasGps && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${order.customerLat},${order.customerLng}`}
                target="_blank"
                rel="noreferrer"
                className={`${quickActionClass} border-sky-500/20 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20`}
                title="Abrir el pin del cliente en Google Maps"
              >
                🗺️ Mapa
                {order.deliveryDistanceKm != null ? ` · ${order.deliveryDistanceKm.toLocaleString('es-CO')} km` : ''}
              </a>
            )}
            {order.paymentProofUrl && (
              <button
                type="button"
                onClick={() => setProofOrderId(order.id)}
                className={`${quickActionClass} ${
                  order.paymentStatus === 'PAID'
                    ? 'border-slate-600 text-slate-300 hover:border-slate-500'
                    : 'animate-pulse border-amber-300 bg-amber-400 font-black text-slate-950 hover:bg-amber-300'
                }`}
                title="Ver el comprobante que envió el cliente por WhatsApp"
              >
                🧾 {order.paymentStatus === 'PAID' ? 'Comprobante' : 'Ver comprobante'}
              </button>
            )}
          </div>
        )}

        {/* Notas especiales */}
        {order.notes && (
          <div className="whitespace-normal break-words rounded border border-amber-500/20 bg-amber-500/10 p-2 text-xs text-amber-300">
            📝 {order.notes}
          </div>
        )}

        {/* Lista de Productos del Ticket */}
        <div className="space-y-1.5 pt-1 border-t border-slate-700/60">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Productos ({order.items?.reduce((acc, it) => acc + it.quantity, 0) || 0})
          </p>
          <div className="space-y-1">
            {order.items?.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between text-xs py-1 border-b border-slate-700/40 last:border-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-amber-400 font-mono shrink-0">
                    {item.quantity}x
                  </span>
                  <span className="break-words font-medium text-slate-200">
                    {item.menuItem?.name || 'Producto'}
                  </span>
                </div>
                {item.subtotal != null && (
                  <span className="text-slate-400 font-mono text-[11px] shrink-0 ml-2">
                    ${item.subtotal.toLocaleString('es-CO')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Botones de Acción Condicionales */}
        <div className="pt-2 border-t border-slate-700/70">
          {order.status === 'PENDING' && (
            <PrepareActions
              busy={isUpdating}
              onPrepare={(minutes) => handleUpdateStatus(order.id, 'PREPARING', minutes)}
              onReject={() => handleUpdateStatus(order.id, 'CANCELLED')}
            />
          )}

          {order.status === 'PREPARING' && (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() =>
                order.orderType === 'DELIVERY' ? setDispatchOrder(order) : handleUpdateStatus(order.id, 'DELIVERED')
              }
              className="w-full min-h-11 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-4 rounded-lg text-sm transition shadow-md shadow-emerald-900/40 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              {isUpdating ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Despachando...</span>
                </>
              ) : (
                <>
                  <span>🛵 Despachar Pedido</span>
                </>
              )}
            </button>
          )}

          {(order.status === 'DELIVERED' || (order.status as string) === 'READY') && (
            <div className="space-y-2">
              <div className="w-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold py-2 px-3 rounded-lg text-xs text-center flex items-center justify-center gap-1.5">
                <span>{order.driverName ? `✓ En camino con ${order.driverName}` : '✓ Pedido Despachado'}</span>
              </div>
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleArchive(order.id)}
                title="Saca el pedido del tablero. Sigue en el historial y en el reporte de Excel."
                className="w-full min-h-11 border border-slate-600 hover:border-slate-400 hover:bg-slate-800 disabled:opacity-50 text-slate-200 font-bold px-3 rounded-lg text-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isUpdating ? 'Archivando...' : '📦 Entregado / Archivar'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Toast Flotante de Nuevo Pedido */}
      {newOrderToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-500 text-slate-950 font-bold px-5 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-400 animate-in slide-in-from-bottom duration-300">
          <span className="text-xl">🔔</span>
          <div>
            <p className="text-sm font-black">¡Nuevo Pedido {newOrderToast.id}!</p>
            <p className="text-xs font-semibold opacity-90">
              {newOrderToast.customer}
              {newOrderToast.total != null && ` • $${newOrderToast.total.toLocaleString('es-CO')}`}
            </p>
          </div>
          <button
            onClick={() => setNewOrderToast(null)}
            className="ml-3 text-slate-950 hover:opacity-70 text-sm font-black"
          >
            ✕
          </button>
        </div>
      )}

      {/* Barra de herramientas (el título lo muestra el TopBar) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            {/* Indicador WebSocket en vivo */}
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                isConnectedWs
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              }`}
              title={isConnectedWs ? 'Conectado al servidor WebSocket en tiempo real' : 'Reconectando WebSocket...'}
            >
              <span
                className={`h-2 w-2 rounded-full ${isConnectedWs ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`}
              />
              <span>{isConnectedWs ? 'En vivo' : 'Sin conexión'}</span>
            </div>
            <span className="text-xs text-slate-500">Tablero Kanban en tiempo real</span>
          </div>
        </div>

        {/* Buscador, Exportar y Actualizar */}
        <div className="flex flex-wrap items-center gap-3">
          <ExportOrdersButton />
          {multiBranch && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              aria-label="Filtrar pedidos por sede"
              className="min-h-11 bg-slate-900 border border-slate-800 rounded-xl px-3 text-sm text-white focus:border-blue-500 outline-none cursor-pointer"
            >
              <option value="">Todas las sedes</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                  {branch.isActive ? '' : ' (inactiva)'}
                </option>
              ))}
            </select>
          )}
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por cliente o #turno..."
              aria-label="Buscar pedidos por cliente, teléfono o turno"
              className="min-h-11 w-full bg-slate-900 border border-slate-800 rounded-xl pl-3.5 pr-10 text-sm text-white placeholder-slate-500 focus:border-blue-500 outline-none sm:w-56 md:w-64 transition [&::-webkit-search-cancel-button]:hidden"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpiar búsqueda"
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-sm text-slate-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          <button
            onClick={() => fetchOrders(true)}
            disabled={loading}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition disabled:opacity-50 cursor-pointer"
            title="Recargar órdenes"
            aria-label="Recargar pedidos"
          >
            <svg
              className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Turno / Horario: prórroga rápida (solo OWNER) */}
      <ShiftExtensionPanel />

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => fetchOrders(true)} className="underline hover:text-rose-300">
            Reintentar
          </button>
        </div>
      )}

      {/* Móvil y tablet: una columna a la vez, con pestañas y contadores (sin scroll infinito) */}
      <div
        role="tablist"
        aria-label="Estado de los pedidos"
        className="sticky top-0 z-20 grid grid-cols-3 gap-1.5 rounded-xl border border-slate-800 bg-slate-950/95 p-1.5 backdrop-blur lg:hidden"
      >
        {KANBAN_COLUMNS.map((column) => {
          const count = columnOrders[column.id].length;
          const selected = mobileColumn === column.id;
          return (
            <button
              key={column.id}
              type="button"
              role="tab"
              id={`kanban-tab-${column.id}`}
              aria-selected={selected}
              aria-controls={`kanban-column-${column.id}`}
              onClick={() => setMobileColumn(column.id)}
              className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-xs font-bold transition sm:flex-row sm:gap-1.5 sm:text-sm ${
                selected ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-1">
                {column.id === 'pending' && count > 0 && !selected && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 animate-pulse" aria-hidden />
                )}
                {column.tab}
              </span>
              <span className={`min-w-6 rounded-full border px-1.5 font-mono text-xs ${column.badge}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Tablero: 3 columnas en escritorio (lg+); en móvil solo la de la pestaña elegida */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        {KANBAN_COLUMNS.map((column) => {
          const list = columnOrders[column.id];
          const visibleOnMobile = mobileColumn === column.id;
          return (
            <section
              key={column.id}
              id={`kanban-column-${column.id}`}
              aria-labelledby={`kanban-title-${column.id}`}
              className={`${visibleOnMobile ? 'flex' : 'hidden'} flex-col rounded-xl border border-slate-800 bg-slate-900/50 p-3 sm:p-4 lg:flex lg:min-h-[70vh]`}
            >
              <div className="mb-4 flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${column.dot}`} />
                  <h2 id={`kanban-title-${column.id}`} className="text-sm font-bold text-white">
                    {column.title}
                  </h2>
                </div>
                <span className={`rounded-full border px-2 py-0.5 font-mono text-xs font-bold ${column.badge}`}>
                  {loading ? '…' : list.length}
                </span>
              </div>

              <div className="flex-1">
                {loading ? (
                  <div className="space-y-4 animate-pulse">
                    <div className="h-44 rounded-lg bg-slate-800/60" />
                    <div className="h-44 rounded-lg bg-slate-800/60" />
                  </div>
                ) : list.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-800 px-4 py-12 text-center text-sm text-slate-500">
                    {column.empty}
                  </div>
                ) : (
                  list.map(renderOrderCard)
                )}
              </div>
            </section>
          );
        })}
      </div>
      {(() => {
        const proofOrder = proofOrderId ? orders.find((o) => o.id === proofOrderId) : null;
        return proofOrder?.paymentProofUrl ? (
          <PaymentProofModal
            order={proofOrder}
            onClose={() => setProofOrderId(null)}
            onConfirmed={(updated) => {
              setOrders((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));
              setProofOrderId(null);
            }}
          />
        ) : null;
      })()}

      {dispatchOrder && (
        <DispatchModal
          order={dispatchOrder}
          onClose={() => setDispatchOrder(null)}
          onDispatched={(driverName) => {
            setOrders((prev) =>
              prev.map((o) => (o.id === dispatchOrder.id ? { ...o, status: 'DELIVERED', driverName } : o)),
            );
            setDispatchOrder(null);
          }}
        />
      )}
    </div>
  );
}
