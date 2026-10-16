'use client';

import React, { useEffect, useState } from 'react';
import { useCart } from '@/context/CartContext';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { type BusinessHours, formatBusinessHours, isRestaurantClosed } from '@/lib/business-hours';

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
}

export interface Category {
  id: string;
  name: string;
  order: number;
  items: MenuItem[];
}

export interface RestaurantData {
  id: string;
  name: string;
  slug: string;
  phone?: string;
  address?: string | null;
  businessHours?: BusinessHours | null;
  isTemporarilyClosed?: boolean;
  closedMessage?: string | null;
  extendedUntil?: string | null;
  categories: Category[];
}

export const MenuView: React.FC<{ restaurant: RestaurantData, tableNumber?: string }> = ({ restaurant, tableNumber }) => {
  const { addItem, items: cartItems } = useCart();
  const [addedItemIds, setAddedItemIds] = useState<{ [key: string]: boolean }>({});

  // Cerrado por botón de emergencia o fuera de horario (hora del local). Se reevalúa cada minuto.
  const [isClosed, setIsClosed] = useState(() => isRestaurantClosed(restaurant));
  useEffect(() => {
    const interval = setInterval(() => setIsClosed(isRestaurantClosed(restaurant)), 60_000);
    return () => clearInterval(interval);
  }, [restaurant]);

  const schedule = formatBusinessHours(restaurant.businessHours);
  const closedNotice =
    restaurant.closedMessage?.trim() ||
    (schedule
      ? `En este momento estamos cerrados. Nuestro horario: ${schedule}.`
      : 'En este momento estamos cerrados. ¡Vuelve pronto!');

  const handleAddItem = (item: MenuItem) => {
    if (!item.isAvailable || isClosed) return;
    addItem({
      id: item.id,
      name: item.name,
      price: item.price,
      imageUrl: item.imageUrl,
    });

    // Feedback visual temporal
    setAddedItemIds((prev) => ({ ...prev, [item.id]: true }));
    setTimeout(() => {
      setAddedItemIds((prev) => ({ ...prev, [item.id]: false }));
    }, 600);
  };

  const getItemCartQuantity = (id: string) => {
    const item = cartItems.find((i) => i.id === id);
    return item ? item.quantity : 0;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-32">
      {/* Header Fijo */}
      <header className="bg-slate-900/85 backdrop-blur-md border-b border-slate-800 sticky top-0 z-30 px-4 py-4 shadow-lg shadow-slate-950/40">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-emerald-400 tracking-wider uppercase">
              Menú Digital
            </span>
            <h1 className="text-xl font-black text-white tracking-tight">{restaurant.name}</h1>
            {restaurant.address && (
              <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                <span aria-hidden>📍</span>
                <span>{restaurant.address}</span>
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {isClosed ? (
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" title="Cerrado" />
                <span className="text-xs text-rose-400 font-semibold">Cerrado</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" title="Abierto para pedidos" />
                <span className="text-xs text-emerald-400 font-semibold">Abierto</span>
              </div>
            )}
            {tableNumber && (
              <span className="text-xs font-bold text-white bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 rounded-md">
                Mesa: {tableNumber}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Contenido: Categorías y Platos */}
      <main className="max-w-md mx-auto px-4 mt-6 space-y-8">
        {isClosed && (
          <div role="status" className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/40 shadow-lg shadow-rose-950/30 space-y-1">
            <p className="text-sm font-bold text-rose-300 flex items-center gap-2">
              <span aria-hidden>🔒</span>
              <span>No estamos recibiendo pedidos</span>
            </p>
            <p className="text-xs text-rose-200/90 leading-relaxed">{closedNotice}</p>
          </div>
        )}

        {restaurant.categories.length === 0 ? (
          <div className="text-center py-16 text-slate-500 space-y-2">
            <div className="h-12 w-12 mx-auto rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
              🍽️
            </div>
            <p className="text-sm font-medium">Este restaurante aún no tiene categorías publicadas.</p>
          </div>
        ) : (
          restaurant.categories.map((category) => (
            <section key={category.id} className="space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <h2 className="text-base font-bold text-slate-100 uppercase tracking-wide">
                  {category.name}
                </h2>
                <span className="text-[11px] text-slate-500 font-mono">
                  {category.items.length} {category.items.length === 1 ? 'opción' : 'opciones'}
                </span>
              </div>

              {category.items.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-2">
                  No hay platos disponibles en esta categoría.
                </p>
              ) : (
                <div className="grid gap-3">
                  {category.items.map((item) => {
                    const quantityInCart = getItemCartQuantity(item.id);
                    const isJustAdded = addedItemIds[item.id];
                    const isSoldOut = !item.isAvailable;

                    return (
                      <article
                        key={item.id}
                        className={`relative bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 flex justify-between items-start gap-4 transition shadow-sm ${
                          isSoldOut ? '' : 'hover:border-slate-700'
                        }`}
                      >
                        {/* Fuera del contenido atenuado para que conserve su color */}
                        {isSoldOut && (
                          <span className="absolute -top-2.5 right-4 bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md shadow-lg shadow-rose-950/50 ring-1 ring-rose-400/40">
                            Agotado
                          </span>
                        )}

                        <div className={`space-y-1.5 flex-1 min-w-0 ${isSoldOut ? 'opacity-50 grayscale' : ''}`}>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-white text-sm md:text-base leading-snug">
                              {item.name}
                            </h3>
                            {quantityInCart > 0 && (
                              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                {quantityInCart} en orden
                              </span>
                            )}
                          </div>

                          {item.description && (
                            <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                              {item.description}
                            </p>
                          )}

                          <p
                            className={`font-extrabold text-sm pt-1 font-mono ${
                              isSoldOut ? 'text-slate-500 line-through' : 'text-emerald-400'
                            }`}
                          >
                            ${item.price.toLocaleString('es-CO')} COP
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddItem(item)}
                          disabled={isSoldOut || isClosed}
                          aria-label={isSoldOut ? `${item.name} agotado` : `Agregar ${item.name}`}
                          className={`shrink-0 text-xs font-bold px-3.5 py-2 rounded-xl transition shadow-md flex items-center gap-1.5 ${
                            isSoldOut || isClosed
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none opacity-50 grayscale'
                              : isJustAdded
                              ? 'bg-emerald-400 text-slate-950 scale-105 active:scale-95'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50 active:scale-95'
                          }`}
                        >
                          {!isSoldOut && !isClosed && (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-3.5 w-3.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M12 5v14" />
                              <path d="M5 12h14" />
                            </svg>
                          )}
                          <span>{isSoldOut ? 'Sin stock' : isClosed ? 'Cerrado' : isJustAdded ? '¡Listo!' : 'Agregar'}</span>
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          ))
        )}
      </main>

      {/* Drawer y Botón Flotante del Carrito */}
      <CartDrawer
        restaurantId={restaurant.id}
        restaurantPhone={restaurant.phone || ''}
        tableNumber={tableNumber}
        isClosed={isClosed}
        closedNotice={closedNotice}
      />
    </div>
  );
};
