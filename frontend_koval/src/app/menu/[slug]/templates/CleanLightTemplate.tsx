'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { formatPrice, useMenuLogic } from './useMenuLogic';
import type { MenuTemplateProps } from './types';

/** Zona superior (bajo el header pegajoso) en la que una categoría cuenta como "actual" */
const SCROLL_SPY_MARGIN = '-150px 0px -55% 0px';

const PlusIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4"
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

/** Tema "clean-light": fresco y diurno, fondo claro, tarjetas blancas y acento esmeralda */
export const CleanLightTemplate: React.FC<MenuTemplateProps> = ({ restaurant, categories, tableNumber }) => {
  const { isClosed, closedNotice, handleAddItem, getItemCartQuantity, isJustAdded } = useMenuLogic(restaurant);

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(() => categories[0]?.id ?? null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Scroll spy: la pestaña activa sigue a la categoría visible bajo el header
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const top = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        setActiveCategoryId(top.target.getAttribute('data-category-id'));
      },
      { rootMargin: SCROLL_SPY_MARGIN },
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [categories]);

  // Mantiene visible la pestaña activa en la barra horizontal
  useEffect(() => {
    if (!activeCategoryId) return;
    tabRefs.current[activeCategoryId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeCategoryId]);

  const goToCategory = (id: string) => {
    setActiveCategoryId(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-32 antialiased">
      {/* Header y categorías: barra blanca pegajosa */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-md mx-auto px-4 pt-4 pb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-black tracking-tight text-slate-900 truncate">{restaurant.name}</h1>
            {restaurant.address && (
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                <span aria-hidden>📍</span>
                <span className="truncate">{restaurant.address}</span>
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                isClosed ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${isClosed ? 'bg-slate-400' : 'bg-emerald-500 animate-pulse'}`}
                aria-hidden
              />
              {isClosed ? 'Cerrado' : 'Abierto'}
            </span>
            {tableNumber && (
              <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                Mesa: {tableNumber}
              </span>
            )}
          </div>
        </div>

        {categories.length > 0 && (
          <nav
            aria-label="Categorías del menú"
            className="max-w-md mx-auto px-4 flex gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {categories.map((category) => {
              const active = category.id === activeCategoryId;
              return (
                <button
                  key={category.id}
                  ref={(el) => {
                    tabRefs.current[category.id] = el;
                  }}
                  type="button"
                  onClick={() => goToCategory(category.id)}
                  aria-current={active ? 'true' : undefined}
                  className={`shrink-0 whitespace-nowrap py-2.5 text-sm font-semibold transition-colors border-b-2 ${
                    active ? 'text-slate-900 border-emerald-500' : 'text-slate-500 hover:text-slate-900 border-transparent'
                  }`}
                >
                  {category.name}
                </button>
              );
            })}
          </nav>
        )}
      </header>

      <main className="max-w-md mx-auto px-4 mt-5 space-y-8">
        {isClosed && (
          <div role="status" className="p-4 rounded-2xl bg-white border border-rose-200 shadow-sm space-y-1">
            <p className="text-sm font-bold text-rose-700 flex items-center gap-2">
              <span aria-hidden>🔒</span>
              <span>No estamos recibiendo pedidos</span>
            </p>
            <p className="text-sm text-slate-500 leading-relaxed">{closedNotice}</p>
          </div>
        )}

        {categories.length === 0 ? (
          <div className="text-center py-16 text-slate-500 space-y-2">
            <div className="h-12 w-12 mx-auto rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center">
              🍽️
            </div>
            <p className="text-sm font-medium">Este restaurante aún no tiene categorías publicadas.</p>
          </div>
        ) : (
          categories.map((category) => (
            <section
              key={category.id}
              ref={(el) => {
                sectionRefs.current[category.id] = el;
              }}
              data-category-id={category.id}
              className="space-y-3 scroll-mt-36"
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-black text-slate-900">{category.name}</h2>
                <span className="text-xs text-slate-500">
                  {category.items.length} {category.items.length === 1 ? 'opción' : 'opciones'}
                </span>
              </div>

              {category.items.length === 0 ? (
                <p className="text-sm text-slate-500 italic py-2">No hay platos disponibles en esta categoría.</p>
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
                        className={`relative bg-white shadow-sm border border-slate-100 rounded-2xl p-4 transition-all flex justify-between items-start gap-4 ${
                          isSoldOut ? '' : 'hover:shadow-md'
                        }`}
                      >
                        {isSoldOut && (
                          <span className="absolute -top-2.5 right-4 bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow">
                            Agotado
                          </span>
                        )}

                        <div className={`flex-1 min-w-0 space-y-1 ${isSoldOut ? 'opacity-50 grayscale' : ''}`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-slate-800 leading-snug">{item.name}</h3>
                            {quantityInCart > 0 && (
                              <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                {quantityInCart} en orden
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-sm text-slate-500 leading-relaxed line-clamp-2">{item.description}</p>
                          )}
                          <p
                            className={`font-black text-lg pt-1 ${
                              isSoldOut ? 'text-slate-400 line-through' : 'text-slate-900'
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
                          className={`self-center shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-all ${
                            disabled
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : justAdded
                                ? 'bg-emerald-600 text-white scale-105'
                                : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-500/30 active:scale-95'
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

      <CartDrawer
        theme="clean-light"
        restaurantId={restaurant.id}
        restaurantPhone={restaurant.phone || ''}
        tableNumber={tableNumber}
        isClosed={isClosed}
        closedNotice={closedNotice}
      />
    </div>
  );
};
