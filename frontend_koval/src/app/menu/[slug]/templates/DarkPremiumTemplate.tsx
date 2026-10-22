'use client';

import React from 'react';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { formatPrice, useMenuLogic } from './useMenuLogic';
import type { MenuTemplateProps } from './types';

const PlusIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-3.5 w-3.5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

/** Tema "dark-premium": fondo zinc casi negro, tarjetas sobrias y acento rojo en las acciones de compra */
export const DarkPremiumTemplate: React.FC<MenuTemplateProps> = ({ restaurant, categories, tableNumber }) => {
  const { isClosed, closedNotice, handleAddItem, getItemCartQuantity, isJustAdded } = useMenuLogic(restaurant);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 pb-32 antialiased">
      {/* Header fijo */}
      <header className="bg-zinc-950/85 backdrop-blur-md border-b border-zinc-800 sticky top-0 z-30 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-red-500 tracking-[0.2em] uppercase">Menú Digital</span>
            <h1 className="text-xl font-black text-white tracking-tight truncate">{restaurant.name}</h1>
            {restaurant.address && (
              <p className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1">
                <span aria-hidden>📍</span>
                <span className="truncate">{restaurant.address}</span>
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {isClosed ? (
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-600" title="Cerrado" />
                <span className="text-xs text-zinc-400 font-semibold">Cerrado</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" title="Abierto para pedidos" />
                <span className="text-xs text-emerald-400 font-semibold">Abierto</span>
              </div>
            )}
            {tableNumber && (
              <span className="text-xs font-bold text-white bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-md">
                Mesa: {tableNumber}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Contenido: categorías y platos */}
      <main className="max-w-md mx-auto px-4 mt-6 space-y-9">
        {isClosed && (
          <div role="status" className="p-4 rounded-2xl bg-zinc-900 border border-red-600/40 space-y-1">
            <p className="text-sm font-bold text-white flex items-center gap-2">
              <span aria-hidden>🔒</span>
              <span>No estamos recibiendo pedidos</span>
            </p>
            <p className="text-xs text-zinc-300 leading-relaxed">{closedNotice}</p>
          </div>
        )}

        {categories.length === 0 ? (
          <div className="text-center py-16 text-zinc-500 space-y-2">
            <div className="h-12 w-12 mx-auto rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              🍽️
            </div>
            <p className="text-sm font-medium">Este restaurante aún no tiene categorías publicadas.</p>
          </div>
        ) : (
          categories.map((category) => (
            <section key={category.id} className="space-y-3.5">
              <div className="flex items-end justify-between border-b border-zinc-800 pb-2">
                <h2 className="flex items-center gap-2 text-base font-bold text-white uppercase tracking-wide">
                  <span className="h-4 w-1 rounded-full bg-red-600" aria-hidden />
                  {category.name}
                </h2>
                <span className="text-[11px] text-zinc-500 font-mono">
                  {category.items.length} {category.items.length === 1 ? 'opción' : 'opciones'}
                </span>
              </div>

              {category.items.length === 0 ? (
                <p className="text-xs text-zinc-500 italic py-2">No hay platos disponibles en esta categoría.</p>
              ) : (
                <div className="grid gap-3">
                  {category.items.map((item) => {
                    const quantityInCart = getItemCartQuantity(item.id);
                    const justAdded = isJustAdded(item.id);
                    const isSoldOut = !item.isAvailable;
                    const disabled = isSoldOut || isClosed;

                    return (
                      <article
                        key={item.id}
                        className={`relative bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex justify-between items-start gap-4 transition ${
                          isSoldOut ? '' : 'hover:border-zinc-700'
                        }`}
                      >
                        {/* Fuera del contenido atenuado para que conserve su color */}
                        {isSoldOut && (
                          <span className="absolute -top-2.5 right-4 bg-zinc-100 text-zinc-950 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md shadow-lg shadow-black/50">
                            Agotado
                          </span>
                        )}

                        <div className={`space-y-1.5 flex-1 min-w-0 ${isSoldOut ? 'opacity-50 grayscale' : ''}`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-white text-sm md:text-base leading-snug">{item.name}</h3>
                            {quantityInCart > 0 && (
                              <span className="bg-red-600/15 text-red-400 border border-red-600/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                {quantityInCart} en orden
                              </span>
                            )}
                          </div>

                          {item.description && (
                            <p className="text-xs text-zinc-300/80 leading-relaxed line-clamp-2">{item.description}</p>
                          )}

                          <p
                            className={`font-extrabold text-sm pt-1 font-mono ${
                              isSoldOut ? 'text-zinc-500 line-through' : 'text-white'
                            }`}
                          >
                            {formatPrice(item.price)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddItem(item)}
                          disabled={disabled}
                          aria-label={isSoldOut ? `${item.name} agotado` : `Agregar ${item.name}`}
                          className={`shrink-0 text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 ${
                            disabled
                              ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-60'
                              : justAdded
                                ? 'bg-white text-zinc-950 scale-105 active:scale-95'
                                : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-950/50 active:scale-95'
                          }`}
                        >
                          {!disabled && <PlusIcon />}
                          <span>{isSoldOut ? 'Sin stock' : isClosed ? 'Cerrado' : justAdded ? '¡Listo!' : 'Agregar'}</span>
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

      {/* Drawer y botón flotante del carrito */}
      <CartDrawer
        theme="dark-premium"
        restaurantId={restaurant.id}
        restaurantPhone={restaurant.phone || ''}
        tableNumber={tableNumber}
        isClosed={isClosed}
        closedNotice={closedNotice}
      />
    </div>
  );
};
