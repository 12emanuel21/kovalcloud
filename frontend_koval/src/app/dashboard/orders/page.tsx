'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { io, Socket } from 'socket.io-client';

type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'DELIVERED' | 'CANCELLED';

type OrderType = 'DINE_IN' | 'DELIVERY' | 'TAKEAWAY';

interface OrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
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
  orderType?: OrderType;
  tableNumber?: string;
  channel?: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string;
  total: number;
  status: OrderStatus;
  notes?: string;
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

export default function OrdersPage() {
  const { restaurantId, token } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isConnectedWs, setIsConnectedWs] = useState<boolean>(false);
  const [newOrderToast, setNewOrderToast] = useState<{ id: string; customer: string; total: number } | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Cargar pedidos desde la API REST
  const fetchOrders = useCallback(async (showLoader = false) => {
    if (!restaurantId) return;
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/orders?restaurantId=${restaurantId}`, {
        cache: 'no-store',
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
  }, [restaurantId]);

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
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnectedWs(true);
      socket.emit('join_restaurant', { restaurantId });
    });

    socket.on('disconnect', () => {
      setIsConnectedWs(false);
    });

    // Escuchar nuevas órdenes
    const handleNewOrder = (newOrder: Order) => {
      if (newOrder.restaurantId === restaurantId) {
        // Reproducir sonido de alerta
        playOrderChime();

        // Mostrar notificación flotante
        setNewOrderToast({
          id: newOrder.id.slice(0, 8).toUpperCase(),
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
          prev.map((ord) => (ord.id === updatedOrder.id ? { ...ord, ...updatedOrder } : ord))
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
  }, [restaurantId]);

  // Actualizar estado del pedido (PATCH a /orders/:id/status)
  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    setUpdatingOrderId(orderId);
    try {
      const currentToken = token || (typeof window !== 'undefined' ? localStorage.getItem('koval_token') : null);
      const res = await fetch(`${API_URL}/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer ' + currentToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
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

  // Filtrado por buscador
  const filterBySearch = (list: Order[]) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (o) =>
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

  const formatOrderTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // Render de tarjeta de orden
  const renderOrderCard = (order: Order) => {
    const isUpdating = updatingOrderId === order.id;
    const shortId = order.id.slice(0, 8).toUpperCase();
    const cleanPhone = order.customerPhone?.replace(/\D/g, '');
    const isWhatsApp = order.channel === 'WHATSAPP';

    return (
      <div
        key={order.id}
        className="bg-slate-800 rounded-lg p-4 shadow-lg border border-slate-700 mb-4 flex flex-col gap-3 transition-all hover:border-slate-600"
      >
        {/* Cabecera del Ticket */}
        <div className="flex items-start justify-between gap-2 border-b border-slate-700/70 pb-2.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-black text-white tracking-wider">
                #{shortId}
              </span>
              {isWhatsApp ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span>WA</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <span>Web</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">{formatOrderTime(order.createdAt)}</p>
          </div>

          <div className="text-right">
            <span className="font-mono text-base font-black text-emerald-400">
              ${order.total.toLocaleString('es-CO')}
            </span>
          </div>
        </div>

        {/* Información del Cliente */}
        <div className="space-y-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white text-sm truncate" title={order.customerName}>
              {order.customerName || 'Cliente'}
            </span>
            {cleanPhone && (
              <a
                href={`https://wa.me/${cleanPhone}`}
                target="_blank"
                rel="noreferrer"
                className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-[10px] font-semibold transition flex items-center gap-1"
                title="Abrir chat en WhatsApp"
              >
                <span>WhatsApp</span>
                <span className="font-mono">↗</span>
              </a>
            )}
          </div>

          {order.customerPhone && (
            <p className="text-slate-400 font-mono text-[11px]">{order.customerPhone}</p>
          )}

          {order.orderType === 'DINE_IN' && order.tableNumber ? (
            <p className="text-indigo-400 font-semibold text-[11px] flex items-center gap-1 pt-1">
              <span>🍽️ Mesa: {order.tableNumber}</span>
            </p>
          ) : order.deliveryAddress ? (
            <p className="text-slate-400 text-[11px] truncate pt-0.5" title={order.deliveryAddress}>
              📍 {order.deliveryAddress}
            </p>
          ) : null}
        </div>

        {/* Notas especiales */}
        {order.notes && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2 text-[11px] text-amber-300">
            📝 {order.notes}
          </div>
        )}

        {/* Lista de Productos del Ticket */}
        <div className="space-y-1.5 pt-1 border-t border-slate-700/60">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Productos ({order.items?.reduce((acc, it) => acc + it.quantity, 0) || 0})
          </p>
          <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
            {order.items?.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between text-xs py-1 border-b border-slate-700/40 last:border-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-amber-400 font-mono shrink-0">
                    {item.quantity}x
                  </span>
                  <span className="text-slate-200 font-medium truncate">
                    {item.menuItem?.name || 'Producto'}
                  </span>
                </div>
                <span className="text-slate-400 font-mono text-[11px] shrink-0 ml-2">
                  ${item.subtotal.toLocaleString('es-CO')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Botones de Acción Condicionales */}
        <div className="pt-2 border-t border-slate-700/70">
          {order.status === 'PENDING' && (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => handleUpdateStatus(order.id, 'PREPARING')}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-lg text-xs transition shadow-md shadow-blue-900/40 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              {isUpdating ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Actualizando...</span>
                </>
              ) : (
                <>
                  <span>👨‍🍳 Iniciar Preparación</span>
                </>
              )}
            </button>
          )}

          {order.status === 'PREPARING' && (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => handleUpdateStatus(order.id, 'DELIVERED')}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-lg text-xs transition shadow-md shadow-emerald-900/40 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
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
            <div className="w-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold py-2 px-3 rounded-lg text-xs text-center flex items-center justify-center gap-1.5">
              <span>✓ Pedido Despachado</span>
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
            <p className="text-sm font-black">¡Nuevo Pedido #{newOrderToast.id}!</p>
            <p className="text-xs font-semibold opacity-90">
              {newOrderToast.customer} • ${newOrderToast.total.toLocaleString('es-CO')}
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

      {/* Cabecera Principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-white tracking-tight">Tablero Kanban de Pedidos</h1>
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
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Gestiona la preparación y despacho de comandas en tiempo real
          </p>
        </div>

        {/* Buscador y Actualizar */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por cliente o #ID..."
              className="bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 outline-none w-56 md:w-64 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          <button
            onClick={() => fetchOrders(true)}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition disabled:opacity-50 cursor-pointer"
            title="Recargar órdenes"
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

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => fetchOrders(true)} className="underline hover:text-rose-300">
            Reintentar
          </button>
        </div>
      )}

      {/* Tablero Kanban (3 Columnas) */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {[1, 2, 3].map((col) => (
            <div
              key={col}
              className="bg-slate-900/50 rounded-xl p-4 border border-slate-800 min-h-[70vh] animate-pulse space-y-4"
            >
              <div className="h-6 bg-slate-800 rounded w-1/3 mb-4" />
              <div className="h-44 bg-slate-800/60 rounded-lg" />
              <div className="h-44 bg-slate-800/60 rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* Columna 1: Pendientes */}
          <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800 min-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse" />
                <h2 className="font-bold text-sm text-white">Pendientes</h2>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold font-mono">
                {pendingOrders.length}
              </span>
            </div>

            <div className="flex-1">
              {pendingOrders.length === 0 ? (
                <div className="text-center py-12 px-4 border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs">
                  No hay pedidos pendientes
                </div>
              ) : (
                pendingOrders.map(renderOrderCard)
              )}
            </div>
          </div>

          {/* Columna 2: En Preparación */}
          <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800 min-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-400" />
                <h2 className="font-bold text-sm text-white">En Preparación</h2>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-bold font-mono">
                {preparingOrders.length}
              </span>
            </div>

            <div className="flex-1">
              {preparingOrders.length === 0 ? (
                <div className="text-center py-12 px-4 border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs">
                  No hay pedidos en preparación
                </div>
              ) : (
                preparingOrders.map(renderOrderCard)
              )}
            </div>
          </div>

          {/* Columna 3: Listos / Despachados */}
          <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800 min-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <h2 className="font-bold text-sm text-white">Listos / Despachados</h2>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold font-mono">
                {deliveredOrders.length}
              </span>
            </div>

            <div className="flex-1">
              {deliveredOrders.length === 0 ? (
                <div className="text-center py-12 px-4 border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs">
                  No hay pedidos despachados
                </div>
              ) : (
                deliveredOrders.map(renderOrderCard)
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
