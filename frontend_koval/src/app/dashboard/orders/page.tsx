'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { io, Socket } from 'socket.io-client';

type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'DELIVERED' | 'CANCELLED';

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

const API_URL = 'http://localhost:4000';

// Reproduce un timbre/chime sonoro para la cocina usando Web Audio API
const playOrderChime = () => {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
  const { restaurantId } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<'ALL' | OrderStatus>('ALL');
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

    const socket = io(API_URL, {
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
    socket.on(`new_order_${restaurantId}`, handleNewOrder);
    socket.on('order_updated', handleOrderUpdated);
    socket.on(`order_updated_${restaurantId}`, handleOrderUpdated);

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [restaurantId]);

  // Actualizar estado del pedido (PATCH)
  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    setUpdatingOrderId(orderId);
    try {
      const res = await fetch(`${API_URL}/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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

  // Filtros
  const filteredOrders = orders.filter((order) => {
    const matchesTab = selectedTab === 'ALL' || order.status === selectedTab;
    const matchesSearch =
      searchQuery === '' ||
      order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerPhone.includes(searchQuery) ||
      order.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  // Conteo de estados
  const counts = {
    ALL: orders.length,
    PENDING: orders.filter((o) => o.status === 'PENDING').length,
    PREPARING: orders.filter((o) => o.status === 'PREPARING').length,
    DELIVERED: orders.filter((o) => o.status === 'DELIVERED').length,
    CANCELLED: orders.filter((o) => o.status === 'CANCELLED').length,
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
            Pendiente
          </span>
        );
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
            Confirmado
          </span>
        );
      case 'PREPARING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
            En Preparación
          </span>
        );
      case 'DELIVERED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            ✓ Entregado
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            ✕ Cancelado
          </span>
        );
      default:
        return null;
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-8 relative">
      {/* Toast Notificación de Nuevo Pedido en Vivo */}
      {newOrderToast && (
        <div className="fixed top-6 right-6 z-50 animate-in fade-in slide-in-from-top duration-300">
          <div className="bg-slate-900/95 border-2 border-emerald-500 rounded-2xl p-4 shadow-2xl shadow-emerald-950/80 backdrop-blur-xl flex items-center gap-4 max-w-sm">
            <div className="h-11 w-11 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black text-lg shadow-lg shadow-emerald-500/30 shrink-0 animate-bounce">
              🔔
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-emerald-400 font-mono">
                  #{newOrderToast.id}
                </span>
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  ¡Nuevo Pedido!
                </span>
              </div>
              <p className="text-sm font-extrabold text-white truncate">{newOrderToast.customer}</p>
              <p className="text-xs text-emerald-400 font-mono font-bold">
                ${newOrderToast.total.toLocaleString('es-CO')} COP
              </p>
            </div>
            <button
              onClick={() => setNewOrderToast(null)}
              className="text-slate-400 hover:text-white text-xs p-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-widest">
              Live Orders
            </span>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition ${
                isConnectedWs
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {isConnectedWs ? '⚡ WebSocket Activo' : 'Conectando WebSocket...'}
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mt-1">
            Gestión de Pedidos en Vivo
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Recepción instantánea de pedidos con alerta sonora para la cocina.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Botón para Probar Alerta Sonora */}
          <button
            type="button"
            onClick={playOrderChime}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/40 text-slate-300 hover:text-emerald-400 text-xs font-semibold transition active:scale-95"
            title="Probar sonido de notificación"
          >
            <span>🔔</span>
            <span>Probar Sonido</span>
          </button>

          <button
            onClick={() => fetchOrders(true)}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition disabled:opacity-50"
            title="Recargar pedidos"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-4 w-4 ${loading ? 'animate-spin text-amber-400' : 'text-slate-400'}`}
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
            <span>{loading ? 'Actualizando...' : 'Actualizar'}</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
          <button
            onClick={() => setSelectedTab('ALL')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              selectedTab === 'ALL'
                ? 'bg-slate-100 text-slate-950 shadow-md shadow-slate-100/10'
                : 'bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Todos</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                selectedTab === 'ALL' ? 'bg-slate-300 text-slate-900' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {counts.ALL}
            </span>
          </button>

          <button
            onClick={() => setSelectedTab('PENDING')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              selectedTab === 'PENDING'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-amber-400'
            }`}
          >
            <span>Pendientes</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                selectedTab === 'PENDING' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-amber-400'
              }`}
            >
              {counts.PENDING}
            </span>
          </button>

          <button
            onClick={() => setSelectedTab('PREPARING')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              selectedTab === 'PREPARING'
                ? 'bg-blue-500 text-slate-950 shadow-md shadow-blue-500/20'
                : 'bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-blue-400'
            }`}
          >
            <span>En Preparación</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                selectedTab === 'PREPARING' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-blue-400'
              }`}
            >
              {counts.PREPARING}
            </span>
          </button>

          <button
            onClick={() => setSelectedTab('DELIVERED')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              selectedTab === 'DELIVERED'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-emerald-400'
            }`}
          >
            <span>Entregados</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                selectedTab === 'DELIVERED' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-emerald-400'
              }`}
            >
              {counts.DELIVERED}
            </span>
          </button>

          <button
            onClick={() => setSelectedTab('CANCELLED')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              selectedTab === 'CANCELLED'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                : 'bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-rose-400'
            }`}
          >
            <span>Cancelados</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                selectedTab === 'CANCELLED' ? 'bg-rose-700 text-white' : 'bg-slate-800 text-rose-400'
              }`}
            >
              {counts.CANCELLED}
            </span>
          </button>
        </div>

        <div className="relative min-w-[240px]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 absolute left-3.5 top-3 text-slate-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por cliente, tel o ID..."
            className="w-full bg-slate-900/90 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none transition"
          />
        </div>
      </div>

      {/* Alerta de Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3 text-red-300">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-red-400 shrink-0 mt-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-200">Error al cargar pedidos</p>
            <p className="text-xs text-red-400/90 mt-0.5">{error}</p>
          </div>
          <button
            onClick={() => fetchOrders(true)}
            className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-xs font-medium transition"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Lista de Pedidos */}
      {loading && orders.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 animate-pulse space-y-4"
            >
              <div className="h-6 bg-slate-800 rounded w-1/2" />
              <div className="h-20 bg-slate-800/60 rounded-xl" />
              <div className="h-10 bg-slate-800 rounded-xl" />
            </div>
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-slate-900/40 border-2 border-dashed border-slate-800 rounded-3xl p-12 text-center space-y-4">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-200">No hay pedidos para mostrar</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {selectedTab === 'ALL'
                ? 'Aún no se han recibido pedidos en el menú digital.'
                : `No hay órdenes con estado "${selectedTab}".`}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredOrders.map((order) => {
            const isUpdating = updatingOrderId === order.id;
            const shortId = order.id.slice(0, 8).toUpperCase();
            const cleanPhone = order.customerPhone.replace(/\D/g, '');

            return (
              <article
                key={order.id}
                className="bg-slate-900/85 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col justify-between space-y-5 hover:border-slate-700 transition"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-white">
                          #{shortId}
                        </span>
                        {getStatusBadge(order.status)}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {formatDate(order.createdAt)}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-base font-black text-emerald-400 font-mono">
                        ${order.total.toLocaleString('es-CO')}
                      </span>
                      <p className="text-[10px] text-slate-500 font-medium">COP</p>
                    </div>
                  </div>

                  {/* Datos del Cliente */}
                  <div className="bg-slate-950/70 rounded-2xl p-3.5 border border-slate-800/80 space-y-2">
                    <div className="flex items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 text-slate-400 shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      <span className="text-xs font-bold text-white truncate">
                        {order.customerName}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs text-slate-300">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-3.5 w-3.5 text-slate-400 shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                        <span>{order.customerPhone}</span>
                      </div>

                      {cleanPhone && (
                        <a
                          href={`https://wa.me/${cleanPhone}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-[10px] font-semibold transition flex items-center gap-1"
                        >
                          <span>WhatsApp</span>
                          <span className="font-mono">↗</span>
                        </a>
                      )}
                    </div>

                    {order.deliveryAddress && (
                      <div className="flex items-start gap-2 text-xs text-slate-400 pt-1 border-t border-slate-800/60">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span className="leading-snug">{order.deliveryAddress}</span>
                      </div>
                    )}
                  </div>

                  {/* Notas Especiales */}
                  {order.notes && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 text-xs text-amber-300 flex items-start gap-2">
                      <span className="shrink-0">📝</span>
                      <span className="leading-relaxed">{order.notes}</span>
                    </div>
                  )}

                  {/* Detalle de Productos */}
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Productos ({order.items.reduce((sum, i) => sum + i.quantity, 0)})
                    </p>
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                      {order.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between text-xs py-1 border-b border-slate-800/50 last:border-0"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-amber-400 font-mono">
                              {item.quantity}x
                            </span>
                            <span className="text-slate-200 truncate">
                              {item.menuItem?.name || `Producto`}
                            </span>
                          </div>
                          <span className="text-slate-400 font-mono shrink-0">
                            ${item.subtotal.toLocaleString('es-CO')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Botones de Cambio de Estado */}
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {order.status === 'PENDING' && (
                      <>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleUpdateStatus(order.id, 'PREPARING')}
                          className="col-span-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2.5 px-3 rounded-xl text-xs transition shadow-md shadow-blue-900/30 flex items-center justify-center gap-1.5"
                        >
                          <span>👨‍🍳 Iniciar Preparación</span>
                        </button>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleUpdateStatus(order.id, 'CANCELLED')}
                          className="col-span-2 bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 disabled:opacity-50 text-slate-400 font-semibold py-1.5 px-3 rounded-xl text-xs transition"
                        >
                          <span>Cancelar Orden</span>
                        </button>
                      </>
                    )}

                    {order.status === 'PREPARING' && (
                      <>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleUpdateStatus(order.id, 'DELIVERED')}
                          className="col-span-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2.5 px-3 rounded-xl text-xs transition shadow-md shadow-emerald-900/30 flex items-center justify-center gap-1.5"
                        >
                          <span>🛵 Marcar como Entregado</span>
                        </button>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleUpdateStatus(order.id, 'CANCELLED')}
                          className="col-span-2 bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 disabled:opacity-50 text-slate-400 font-semibold py-1.5 px-3 rounded-xl text-xs transition"
                        >
                          <span>Cancelar Orden</span>
                        </button>
                      </>
                    )}

                    {order.status === 'DELIVERED' && (
                      <div className="col-span-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold py-2 px-3 rounded-xl text-center flex items-center justify-center gap-1.5">
                        <span>✓ Orden completada y entregada</span>
                      </div>
                    )}

                    {order.status === 'CANCELLED' && (
                      <div className="col-span-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold py-2 px-3 rounded-xl text-center flex items-center justify-center gap-1.5">
                        <span>✕ Orden cancelada</span>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
