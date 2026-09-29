'use client';

import React, { useState, useEffect, useRef, use } from 'react';
import { io, Socket } from 'socket.io-client';

type OrderType = 'DINE_IN' | 'DELIVERY' | 'TAKEAWAY';
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

const API_URL = 'http://localhost:4000';

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

  return <span className="font-mono text-xl text-amber-400">{elapsed || '00:00'} min</span>;
};

export default function KitchenPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = use(params);
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [isConnectedWs, setIsConnectedWs] = useState(false);
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

  // Fetch initial orders
  const fetchOrders = async () => {
    try {
      const res = await fetch(`${API_URL}/orders?restaurantId=${restaurantId}`);
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

    const socket = io(API_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnectedWs(true);
      socket.emit('join_restaurant', { restaurantId });
    });

    socket.on('disconnect', () => {
      setIsConnectedWs(false);
    });

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
    socket.on(`new_order_${restaurantId}`, handleNewOrder);
    socket.on('order_updated', handleOrderUpdated);
    socket.on(`order_updated_${restaurantId}`, handleOrderUpdated);

    return () => {
      socket.disconnect();
    };
  }, [restaurantId]);

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    try {
      await fetch(`${API_URL}/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      // La actualización local se manejará idealmente a través del websocket, 
      // pero actualizamos optimísticamente:
      if (status === 'DELIVERED') {
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
      } else {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header Minimalista KDS */}
      <header className="bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase">KDS COCINA</h1>
          <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 ${isConnectedWs ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${isConnectedWs ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
            {isConnectedWs ? 'EN LÍNEA' : 'DESCONECTADO'}
          </div>
        </div>
        <div className="text-4xl font-mono font-bold text-white tracking-wider">
          {currentTime || '00:00:00'}
        </div>
      </header>

      {/* Grid de Pedidos */}
      <main className="flex-1 p-6 overflow-x-auto">
        {orders.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            <h2 className="text-4xl font-bold">No hay pedidos activos</h2>
          </div>
        ) : (
          <div className="flex gap-6 h-full items-start overflow-x-auto pb-4">
            {/* Sort orders: PENDING first, then PREPARING, oldest first */}
            {orders
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
              .sort((a, b) => (a.status === 'PENDING' ? -1 : 1))
              .map((order) => {
                const isDineIn = order.orderType === 'DINE_IN';
                
                return (
                  <article 
                    key={order.id} 
                    className={`min-w-[400px] w-[400px] flex flex-col rounded-3xl border-2 shrink-0 h-full max-h-[85vh] overflow-hidden ${order.status === 'PENDING' ? 'bg-slate-900 border-amber-500/50 shadow-lg shadow-amber-900/20' : 'bg-slate-900 border-blue-500/50 shadow-lg shadow-blue-900/20'}`}
                  >
                    {/* Tarjeta Header */}
                    <div className={`p-4 border-b-2 flex flex-col gap-2 ${order.status === 'PENDING' ? 'border-amber-500/30 bg-amber-500/10' : 'border-blue-500/30 bg-blue-500/10'}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                            Orden #{order.id.slice(0, 5).toUpperCase()}
                          </span>
                          <div className="mt-1">
                            {isDineIn ? (
                              <span className="text-5xl font-black text-indigo-400 tracking-tighter">
                                MESA {order.tableNumber || '?'}
                              </span>
                            ) : (
                              <span className="text-3xl font-black text-purple-400 tracking-tighter flex items-center gap-3">
                                🛵 DOMICILIO
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <span className={`px-3 py-1 rounded-lg text-sm font-bold uppercase ${order.status === 'PENDING' ? 'bg-amber-500 text-slate-950' : 'bg-blue-500 text-white'}`}>
                            {order.status === 'PENDING' ? 'PENDIENTE' : 'PREPARANDO'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between bg-slate-950/50 rounded-xl p-3 mt-2 border border-slate-800">
                        <span className="font-bold text-slate-300 uppercase truncate max-w-[180px]">👤 {order.customerName}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-500 font-bold uppercase">TIEMPO:</span>
                          <OrderTimer createdAt={order.createdAt} />
                        </div>
                      </div>
                    </div>

                    {/* Contenido (Items) */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex items-start gap-4 p-3 bg-slate-950/40 rounded-2xl border border-slate-800/80">
                          <div className="bg-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-xl text-2xl font-black font-mono border border-emerald-500/30">
                            {item.quantity}
                          </div>
                          <div className="flex-1 pt-1">
                            <h3 className="text-2xl font-bold text-white leading-tight">
                              {item.menuItem?.name || 'Producto Desconocido'}
                            </h3>
                          </div>
                        </div>
                      ))}
                      
                      {order.notes && (
                        <div className="mt-4 p-4 bg-amber-500/20 border-2 border-amber-500/40 rounded-2xl">
                          <h4 className="text-amber-400 font-bold uppercase text-sm mb-1 flex items-center gap-2">
                            <span>⚠️</span> NOTAS DEL PEDIDO
                          </h4>
                          <p className="text-xl font-medium text-amber-200 leading-snug">{order.notes}</p>
                        </div>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="p-4 bg-slate-950 border-t-2 border-slate-800">
                      {order.status === 'PENDING' ? (
                        <button
                          onClick={() => updateStatus(order.id, 'PREPARING')}
                          className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-3xl font-black uppercase py-6 rounded-2xl transition-transform active:scale-[0.98] shadow-xl shadow-blue-900/50 border border-blue-400"
                        >
                          👨‍🍳 Preparar
                        </button>
                      ) : (
                        <button
                          onClick={() => updateStatus(order.id, 'DELIVERED')}
                          className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-3xl font-black uppercase py-6 rounded-2xl transition-transform active:scale-[0.98] shadow-xl shadow-emerald-900/50 border border-emerald-400"
                        >
                          ✅ Listo / Despachar
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
