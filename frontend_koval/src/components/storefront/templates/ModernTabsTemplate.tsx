'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Flame, Minus, Plus, Sparkles } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { formatPrice } from '@/app/menu/[slug]/templates/useMenuLogic';
import type { MenuItem } from '@/app/menu/[slug]/templates/types';
import { DishImage, MenuEmptyState, MobileSearch, filterCategories } from './shared';
import type { MenuSectionProps } from './types';

const MENU_ANCHOR = 'menu';

/**
 * Plantilla "Pestañas Modernas" (modern-tabs), estilo app de delivery: pestañas fijas con el número
 * de platos y una sola categoría a la vista (sin scroll infinito). Tarjetas con foto panorámica 16:9,
 * badges "Popular" / "Nuevo" y contador para sumar o quitar del pedido sin abrir el carrito.
 */
export function ModernTabsTemplate({
  categories,
  query,
  onQueryChange,
  palette,
  isClosed,
  onAdd,
  getQuantity,
  isJustAdded,
  popularItemIds,
  newItemIds,
}: MenuSectionProps) {
  const visibleCategories = useMemo(() => filterCategories(categories, query), [categories, query]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Si la pestaña elegida no tiene resultados (búsqueda), se muestra la primera que sí
  const activeId =
    selectedId && visibleCategories.some((c) => c.id === selectedId) ? selectedId : (visibleCategories[0]?.id ?? null);
  const active = visibleCategories.find((c) => c.id === activeId);

  const baseId = useId();
  const tabId = (id: string) => `${baseId}-tab-${id}`;
  const panelId = `${baseId}-panel`;
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  // La pestaña activa se mantiene visible dentro de la barra deslizable
  useEffect(() => {
    const bar = tabsRef.current;
    const tab = activeId ? tabRefs.current.get(activeId) : undefined;
    if (bar && tab) bar.scrollTo({ left: tab.offsetLeft - (bar.clientWidth - tab.clientWidth) / 2, behavior: 'smooth' });
  }, [activeId]);

  const selectTab = (id: string, focus = false) => {
    setSelectedId(id);
    if (focus) tabRefs.current.get(id)?.focus();
    // Si la barra ya está pegada arriba, la nueva categoría arranca desde su primer plato
    const menu = document.getElementById(MENU_ANCHOR);
    if (menu && menu.getBoundingClientRect().top < 0) menu.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Teclado de pestañas (WAI-ARIA): flechas, Inicio y Fin
  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    const last = visibleCategories.length - 1;
    const next =
      e.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    selectTab(visibleCategories[next].id, true);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <MobileSearch query={query} onQueryChange={onQueryChange} palette={palette} className="mb-1" />

      {visibleCategories.length > 0 && (
        <div className="sticky top-16 z-20 -mx-4 border-b border-sf-border bg-sf-bg/95 backdrop-blur-xl md:-mx-6">
          <div
            ref={tabsRef}
            role="tablist"
            aria-label="Categorías"
            className="flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:px-6 [&::-webkit-scrollbar]:hidden"
          >
            {visibleCategories.map((category, index) => {
              const selected = category.id === activeId;
              return (
                <button
                  key={category.id}
                  ref={(el) => {
                    if (el) tabRefs.current.set(category.id, el);
                    else tabRefs.current.delete(category.id);
                  }}
                  id={tabId(category.id)}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={panelId}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => selectTab(category.id)}
                  onKeyDown={(e) => onTabKeyDown(e, index)}
                  className={`relative shrink-0 whitespace-nowrap px-4 py-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sf-primary ${
                    selected ? 'text-sf-primary' : 'text-sf-muted hover:text-sf-text'
                  }`}
                >
                  {category.name}{' '}
                  <span className={selected ? 'text-sf-primary/80' : 'text-sf-muted/80'}>({category.items.length})</span>
                  <span
                    className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-sf-primary transition-opacity ${selected ? 'opacity-100' : 'opacity-0'}`}
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!active ? (
        <div className="pb-6 pt-6">
          <MenuEmptyState categories={categories} query={query} onQueryChange={onQueryChange} palette={palette} />
        </div>
      ) : (
        <div id={panelId} role="tabpanel" aria-labelledby={tabId(active.id)} className="pb-8 pt-6">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-black tracking-tight text-sf-text md:text-2xl">{active.name}</h2>
            <span className="text-xs text-sf-muted">
              {active.items.length} {active.items.length === 1 ? 'plato' : 'platos'}
            </span>
          </div>
          {active.items.length === 0 ? (
            <p className="rounded-sf-lg border border-sf-border bg-sf-card px-4 py-10 text-center text-sm text-sf-muted">
              No hay platos disponibles en esta categoría.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {active.items.map((item) => (
                <TabDishCard
                  key={item.id}
                  item={item}
                  isClosed={isClosed}
                  quantity={getQuantity(item.id)}
                  justAdded={isJustAdded(item.id)}
                  badge={popularItemIds.includes(item.id) ? 'popular' : newItemIds.includes(item.id) ? 'new' : null}
                  onAdd={() => onAdd(item)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabDishCard({
  item,
  isClosed,
  quantity,
  justAdded,
  badge,
  onAdd,
}: {
  item: MenuItem;
  isClosed: boolean;
  quantity: number;
  justAdded: boolean;
  badge: 'popular' | 'new' | null;
  onAdd: () => void;
}) {
  const { updateQuantity } = useCart();
  const isSoldOut = !item.isAvailable;
  const disabled = isSoldOut || isClosed;

  return (
    <article className="group flex flex-col overflow-hidden rounded-sf-lg border border-sf-border bg-sf-card shadow-sm transition hover:shadow-md">
      <div className="relative aspect-video w-full overflow-hidden bg-sf-bg">
        <DishImage src={item.imageUrl} alt={item.name} dimmed={isSoldOut} iconClassName="h-10 w-10" />
        {badge && !isSoldOut && (
          <span
            className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-md ${
              badge === 'popular' ? 'bg-sf-primary text-sf-on-primary' : 'bg-sf-card text-sf-text'
            }`}
          >
            {badge === 'popular' ? <Flame className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5 text-sf-primary" />}
            {badge === 'popular' ? 'Popular' : 'Nuevo'}
          </span>
        )}
        {isSoldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-wider text-zinc-950 shadow-lg">
              Agotado
            </span>
          </div>
        )}
      </div>

      <div className={`flex flex-1 flex-col p-4 ${isSoldOut ? 'opacity-60' : ''}`}>
        <h3 className="text-base font-bold leading-snug text-sf-text">{item.name}</h3>
        {item.description && <p className="mt-1 line-clamp-2 text-sm text-sf-muted">{item.description}</p>}

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <p className={`text-lg font-extrabold ${isSoldOut ? 'text-sf-muted line-through' : 'text-sf-primary'}`}>
            {formatPrice(item.price)}
          </p>

          {quantity > 0 && !disabled ? (
            <div className="flex items-center rounded-full border border-sf-primary/40 bg-sf-primary/10" role="group" aria-label={`Cantidad de ${item.name}`}>
              <button
                type="button"
                onClick={() => updateQuantity(item.id, quantity - 1)}
                aria-label={`Quitar un ${item.name}`}
                className="flex h-9 w-9 items-center justify-center rounded-full text-sf-primary transition hover:bg-sf-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sf-primary"
              >
                <Minus className="h-4 w-4" strokeWidth={2.5} />
              </button>
              <span className="min-w-6 text-center text-sm font-bold text-sf-text" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                onClick={onAdd}
                aria-label={`Agregar otro ${item.name}`}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-sf-primary text-sf-on-primary transition hover:bg-sf-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sf-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sf-card"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              disabled={disabled}
              aria-label={isSoldOut ? `${item.name} agotado` : isClosed ? `${item.name}: local cerrado` : `Agregar ${item.name}`}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sf-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sf-card ${
                disabled
                  ? 'cursor-not-allowed bg-sf-border text-sf-muted'
                  : justAdded
                    ? 'scale-105 bg-emerald-500 text-white'
                    : 'bg-sf-primary text-sf-on-primary shadow-md shadow-sf-primary/25 hover:bg-sf-primary-hover active:scale-95'
              }`}
            >
              {justAdded ? <Check className="h-4 w-4" strokeWidth={3} /> : !disabled && <Plus className="h-4 w-4" strokeWidth={2.5} />}
              {isSoldOut ? 'Agotado' : isClosed ? 'Cerrado' : justAdded ? 'Listo' : 'Agregar'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
