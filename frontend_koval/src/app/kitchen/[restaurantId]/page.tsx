'use client';

import React, { useState, useEffect, useRef, use, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/context/AuthContext';
import PrepareActions from '@/components/orders/PrepareActions';
import {
  ChefHat,
  CircleAlert,
  CircleCheck,
  Clock,
  Motorbike,
  ShoppingBag,
  User,
  Utensils,
  type LucideIcon,
} from 'lucide-react';

type OrderType = 'DINE_IN' | 'DELIVERY' | 'TAKEAWAY';
type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'DELIVERED' | 'CANCELLED';

interface OrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  quantity: number;
  // null para el rol KITCHEN (el backend no envía importes a la cocina); el KDS no los muestra
  unitPrice: number | null;
  subtotal: number | null;
  menuItem?: {
    id: string;
    name: string;
  };
}

interface Order {
  id: string;
  restaurantId: string;
  customerName: string;
  orderType?: OrderType;
  tableNumber?: string;
  channel?: string;
  status: OrderStatus;
  notes?: string;
  items: OrderItem[];
  createdAt: string;
}

const API_URL = typeof window !== "undefined" ? "/api" : "http://koval_backend:4000";
const SOCKET_URL =
  typeof window === "undefined"
    ? API_URL
    : window.location.port === "3030"
      ? `${window.location.protocol}//${window.location.hostname}:4000` // acceso directo sin Nginx
      : "/"; // detrás de Nginx (puerto 80) -> /socket.io/ proxificado

const playOrderChime = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

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

/** A partir de estos minutos el cronómetro se marca como urgente */
const URGENT_AFTER_MINUTES = 15;

// Componente para el cronómetro de cada tarjeta
const OrderTimer: React.FC<{ createdAt: string }> = ({ createdAt }) => {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Date.now() - new Date(createdAt).getTime();
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setElapsed(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  const minutes = parseInt(elapsed.split(':')[0] || '0', 10);
  const urgent = minutes >= URGENT_AFTER_MINUTES;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-sm font-medium tabular-nums ${
        urgent ? 'text-red-400' : 'text-slate-400'
      }`}
      title={urgent ? `Más de ${URGENT_AFTER_MINUTES} minutos en espera` : 'Tiempo desde que se recibió'}
    >
      <Clock className={`h-4 w-4 ${urgent ? 'animate-pulse' : ''}`} />
      {elapsed || '00:00'}
    </span>
  );
};

/**
 * Orden FIFO determinista: el más antiguo primero; si coinciden en createdAt,
 * desempata por id. Nunca muta el array recibido.
 */
const sortOldestFirst = (list: Order[]): Order[] =>
  [...list].sort((a, b) => {
    const byDate = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
  });

/** Presentación del tipo de pedido (solo visual) */
const ORDER_TYPE_DISPLAY: Record<OrderType, { label: (o: Order) => string; icon: LucideIcon; iconClass: string }> = {
  DINE_IN: { label: (o) => `Mesa ${o.tableNumber || '?'}`, icon: Utensils, iconClass: 'text-sky-400' },
  DELIVERY: { label: () => 'Domicilio', icon: Motorbike, iconClass: 'text-emerald-400' },
  TAKEAWAY: { label: () => 'Para llevar', icon: ShoppingBag, iconClass: 'text-amber-300' },
};

export default function KitchenPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = use(params);
  const { logout } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [isConnectedWs, setIsConnectedWs] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState('');
  const socketRef = useRef<Socket | null>(null);

  // Reloj
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('es-CO', { hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // La pantalla de cocina usa la sesión del dashboard (mismo navegador)
  const authHeaders = (): Record<string, string> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('koval_token') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Fetch initial orders
  const fetchOrders = async () => {
    try {
      const res = await fetch(`${API_URL}/orders?restaurantId=${restaurantId}`, { headers: authHeaders() });
      if (res.status === 401 || res.status === 403) {
        console.error('Sesión requerida: inicia sesión en el dashboard de este restaurante para ver la cocina.');
        return;
      }
      if (!res.ok) throw new Error('Error fetching orders');
      const data: Order[] = await res.json();
      // Filtrar solo pendientes y preparando
      const activeOrders = data.filter((o) => o.status === 'PENDING' || o.status === 'PREPARING');
      setOrders(activeOrders);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (restaurantId) {
      fetchOrders();
    }
  }, [restaurantId]);

  // WebSocket
  useEffect(() => {
    if (!restaurantId) return;

    const socket = io(SOCKET_URL, {
      path: "/socket.io/",
      transports: ["websocket", "polling"],
      // El gateway rechaza conexiones sin JWT válido
      auth: { token: typeof window !== 'undefined' ? localStorage.getItem('koval_token') : '' },
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

    const handleNewOrder = (newOrder: Order) => {
      if (newOrder.restaurantId === restaurantId && (newOrder.status === 'PENDING' || newOrder.status === 'PREPARING')) {
        playOrderChime();
        setOrders((prev) => {
          if (prev.some((o) => o.id === newOrder.id)) return prev;
          return [...prev, newOrder];
        });
      }
    };

    const handleOrderUpdated = (updatedOrder: Order) => {
      if (updatedOrder.restaurantId === restaurantId) {
        setOrders((prev) => {
          if (updatedOrder.status === 'DELIVERED' || updatedOrder.status === 'CANCELLED') {
            return prev.filter((o) => o.id !== updatedOrder.id);
          }
          const exists = prev.some((o) => o.id === updatedOrder.id);
          if (exists) {
            return prev.map((o) => (o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o));
          } else {
            return [...prev, updatedOrder];
          }
        });
      }
    };

    socket.on('new_order', handleNewOrder);
    socket.on('order_updated', handleOrderUpdated);
    return () => {
      socket.disconnect();
    };
  }, [restaurantId, logout]);

  // estimatedMinutes: al pasar a PREPARING el backend avisa al cliente por WhatsApp con ese tiempo
  const updateStatus = async (orderId: string, status: OrderStatus, estimatedMinutes?: number) => {
    setUpdatingOrderId(orderId);
    try {
      const res = await fetch(`${API_URL}/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ status, estimatedMinutes }),
      });
      if (!res.ok) throw new Error(`No se pudo actualizar el pedido (${res.status})`);
      // La actualización local se manejará idealmente a través del websocket,
      // pero actualizamos optimísticamente:
      if (status === 'DELIVERED' || status === 'CANCELLED') {
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
      } else {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // Copia ordenada para renderizar: el estado `orders` nunca se muta
  const sortedOrders = useMemo(() => sortOldestFirst(orders), [orders]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased">
      {/* Header KDS */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <ChefHat className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-white tracking-tight leading-tight">Monitor de Cocina</h1>
              <p className="text-xs text-slate-500">
                {orders.length} {orders.length === 1 ? 'pedido activo' : 'pedidos activos'}
              </p>
            </div>
          </div>
          <div
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
              isConnectedWs
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${isConnectedWs ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            {isConnectedWs ? 'En línea' : 'Desconectado'}
          </div>
        </div>
        <div className="font-mono text-2xl font-semibold text-slate-200 tabular-nums tracking-wide">
          {currentTime || '00:00:00'}
        </div>
      </header>

      {/* Grid de Pedidos */}
      <main className="flex-1 p-6 overflow-x-auto">
        {orders.length === 0 ? (
          <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-500">
              <CircleCheck className="h-7 w-7" />
            </span>
            <h2 className="text-xl font-semibold text-slate-300">No hay pedidos activos</h2>
            <p className="text-sm text-slate-500">Los nuevos pedidos aparecerán aquí con un aviso sonoro.</p>
          </div>
        ) : (
          <div className="flex gap-5 h-full items-start overflow-x-auto pb-4">
            {/* Más antiguos primero (FIFO) */}
            {sortedOrders.map((order) => {
                const isPending = order.status === 'PENDING';
                const typeDisplay = ORDER_TYPE_DISPLAY[order.orderType ?? 'DELIVERY'];
                const TypeIcon = typeDisplay.icon;

                return (
                  <article
                    key={order.id}
                    className="w-[420px] min-w-[420px] shrink-0 flex flex-col max-h-[85vh] bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg"
                  >
                    {/* Cabecera de la tarjeta */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-slate-500">#{order.id.slice(0, 5).toUpperCase()}</p>
                        <p className="mt-1 flex items-center gap-2.5 text-3xl font-bold tracking-tight text-slate-100">
                          <TypeIcon className={`h-7 w-7 shrink-0 ${typeDisplay.iconClass}`} />
                          <span className="truncate">{typeDisplay.label(order)}</span>
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          isPending
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        }`}
                      >
                        {isPending ? 'Pendiente' : 'Preparando'}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
                      <span className="flex min-w-0 items-center gap-1.5 text-sm text-slate-300">
                        <User className="h-4 w-4 shrink-0 text-slate-500" />
                        <span className="truncate">{order.customerName}</span>
                      </span>
                      <OrderTimer createdAt={order.createdAt} />
                    </div>

                    {/* Contenido (Items y notas) */}
                    <div className="flex-1 overflow-y-auto py-3 space-y-3 custom-scrollbar">
                      <ul className="bg-slate-800/50 rounded-lg p-3 space-y-3">
                        {order.items.map((item, idx) => (
                          <li key={idx} className="flex items-center gap-3">
                            <span className="min-w-[3.5rem] rounded-md bg-slate-950/60 px-2 py-0.5 text-center font-mono text-2xl font-bold text-emerald-400">
                              {item.quantity}x
                            </span>
                            <span className="text-xl font-bold text-slate-100 leading-snug">
                              {item.menuItem?.name || 'Producto Desconocido'}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {order.notes && (
                        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm rounded-lg p-3">
                          <CircleAlert className="h-4 w-4 shrink-0 mt-0.5" />
                          <p className="leading-snug">{order.notes}</p>
                        </div>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="pt-3 border-t border-slate-800">
                      {isPending ? (
                        <PrepareActions
                          size="lg"
                          busy={updatingOrderId === order.id}
                          onPrepare={(minutes) => updateStatus(order.id, 'PREPARING', minutes)}
                          onReject={() => updateStatus(order.id, 'CANCELLED')}
                        />
                      ) : (
                        <button
                          disabled={updatingOrderId === order.id}
                          onClick={() => updateStatus(order.id, 'DELIVERED')}
                          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg py-2.5 font-medium transition-colors"
                        >
                          <CircleCheck className="h-4 w-4" />
                          Entregar
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
          </div>
        )}
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.5); 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(51, 65, 85, 0.8); 
          border-radius: 10px;
        }
      `}} />
    </div>
  );
}
