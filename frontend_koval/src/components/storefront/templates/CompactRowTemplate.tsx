'use client';

import React, { useMemo } from 'react';
import { Check, Plus } from 'lucide-react';
import { formatPrice } from '@/app/menu/[slug]/templates/useMenuLogic';
import type { MenuItem } from '@/app/menu/[slug]/templates/types';
import { DishImage, MenuEmptyState, MobileSearch, filterCategories } from './shared';
import type { MenuSectionProps } from './types';
import { categorySectionId, useCategoryScrollSpy } from './useCategoryScrollSpy';

/** Alto del header (h-16) + barra de categorías: el título de la categoría queda visible al saltar */
const SECTION_SCROLL_MARGIN = 'scroll-mt-[8.5rem]';

/**
 * Plantilla "Lista Compacta" (compact-row), estilo apps de delivery: barra de categorías en píldoras
 * que lleva a cada sección con scroll suave (y se resalta sola al hacer scroll) y platos en filas
 * densas con la foto (o un placeholder) a la derecha. Ideal para cartas extensas (sushi, comida asiática…).
 */
export function CompactRowTemplate({
  categories,
  query,
  onQueryChange,
  palette,
  isClosed,
  onAdd,
  getQuantity,
  isJustAdded,
}: MenuSectionProps) {
  const visibleCategories = useMemo(() => filterCategories(categories, query), [categories, query]);
  const { navRef, currentId, goToCategory, registerItem } = useCategoryScrollSpy(visibleCategories);

  return (
    <div className="mx-auto max-w-5xl">
      <MobileSearch query={query} onQueryChange={onQueryChange} palette={palette} className="mb-1" />

      {/* Barra de categorías pegajosa bajo el header */}
      {visibleCategories.length > 0 && (
        <nav
          ref={navRef}
          aria-label="Categorías"
          className="sticky top-16 z-20 -mx-4 flex gap-2 overflow-x-auto border-b border-sf-border bg-sf-bg px-4 py-3 [scrollbar-width:none] md:-mx-6 md:px-6 [&::-webkit-scrollbar]:hidden"
        >
          {visibleCategories.map((category) => {
            const active = category.id === currentId;
            return (
              <button
                key={category.id}
                ref={registerItem(category.id)}
                type="button"
                onClick={() => goToCategory(category.id)}
                aria-current={active ? 'true' : undefined}
                className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sf-primary ${
                  active
                    ? 'border-sf-primary bg-sf-primary text-sf-on-primary shadow-sm shadow-sf-primary/25'
                    : 'border-sf-border bg-sf-card text-sf-body hover:border-sf-muted hover:text-sf-text'
                }`}
              >
                {category.name}
              </button>
            );
          })}
        </nav>
      )}

      <div className="pb-6 pt-2">
        {visibleCategories.length === 0 ? (
          <div className="pt-4">
            <MenuEmptyState categories={categories} query={query} onQueryChange={onQueryChange} palette={palette} />
          </div>
        ) : (
          visibleCategories.map((category) => (
            <section key={category.id} id={categorySectionId(category.id)} className={`${SECTION_SCROLL_MARGIN} pt-6`}>
              <div className="flex items-baseline justify-between gap-3 px-3.5 pb-1">
                <h2 className="text-lg font-bold text-sf-text">{category.name}</h2>
                <span className="text-xs text-sf-muted">
                  {category.items.length} {category.items.length === 1 ? 'plato' : 'platos'}
                </span>
              </div>
              {category.items.length === 0 ? (
                <p className="border-b border-sf-border px-3.5 py-4 text-sm italic text-sf-muted">
                  No hay platos disponibles en esta categoría.
                </p>
              ) : (
                <ul className="lg:grid lg:grid-cols-2 lg:gap-x-8">
                  {category.items.map((item) => (
                    <DishRow
                      key={item.id}
                      item={item}
                      isClosed={isClosed}
                      quantity={getQuantity(item.id)}
                      justAdded={isJustAdded(item.id)}
                      onAdd={() => onAdd(item)}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function DishRow({
  item,
  isClosed,
  quantity,
  justAdded,
  onAdd,
}: {
  item: MenuItem;
  isClosed: boolean;
  quantity: number;
  justAdded: boolean;
  onAdd: () => void;
}) {
  const isSoldOut = !item.isAvailable;
  const disabled = isSoldOut || isClosed;
  const addLabel = isSoldOut ? `${item.name} agotado` : isClosed ? `${item.name}: local cerrado` : `Agregar ${item.name}`;

  return (
    <li className="flex items-center justify-between gap-3 border-b border-sf-border p-3.5">
      <div className={`min-w-0 flex-1 ${isSoldOut ? 'opacity-60' : ''}`}>
        <h3 className="text-base font-semibold leading-snug text-sf-text">{item.name}</h3>
        {item.description && <p className="mt-0.5 line-clamp-2 text-xs text-sf-muted">{item.description}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`text-sm font-bold ${isSoldOut ? 'text-sf-muted line-through' : 'text-sf-primary'}`}>
            {formatPrice(item.price)}
          </span>
          {isSoldOut && (
            <span className="rounded-full bg-sf-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sf-text">
              Agotado
            </span>
          )}
          {quantity > 0 && (
            <span className="rounded-full bg-sf-primary/10 px-2 py-0.5 text-[11px] font-bold text-sf-primary">
              {quantity} en tu pedido
            </span>
          )}
        </div>
      </div>

      {/* Foto siempre visible (o placeholder): todas las filas mantienen el mismo ritmo */}
      <div className="relative h-24 w-24 shrink-0">
        <div className="h-full w-full overflow-hidden rounded-sf border border-sf-border bg-sf-card">
          <DishImage src={item.imageUrl} alt={item.name} dimmed={isSoldOut} />
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          aria-label={addLabel}
          className={`absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full shadow-lg ring-2 ring-sf-bg transition focus-visible:outline-none focus-visible:ring-sf-primary ${
            disabled
              ? 'cursor-not-allowed bg-sf-border text-sf-muted'
              : justAdded
                ? 'scale-110 bg-emerald-500 text-white'
                : 'bg-sf-primary text-sf-on-primary hover:bg-sf-primary-hover active:scale-90'
          }`}
        >
          {justAdded ? <Check className="h-4 w-4" strokeWidth={3} /> : <Plus className="h-5 w-5" strokeWidth={2.5} />}
        </button>
      </div>
    </li>
  );
}
