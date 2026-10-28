'use client';

import React, { useMemo, useState } from 'react';
import { ArrowRight, LayoutGrid, Plus } from 'lucide-react';
import { formatPrice } from '@/app/menu/[slug]/templates/useMenuLogic';
import { getCategoryIcon } from '@/app/menu/[slug]/templates/categoryIcons';
import type { MenuPalette } from '@/app/menu/[slug]/templates/palettes';
import type { Category, MenuItem } from '@/app/menu/[slug]/templates/types';
import { MenuEmptyState, MobileSearch, filterCategories } from './shared';
import type { MenuSectionProps } from './types';

/**
 * Plantilla "Cuadrícula Visual" (visual-grid): pestañas de categorías con iconos que filtran
 * ("Ver solo esta") y tarjetas grandes con foto protagonista. Ideal para fast-food y pizzerías.
 */
export function VisualGridTemplate({
  categories,
  query,
  onQueryChange,
  palette,
  isClosed,
  onAdd,
  getQuantity,
  isJustAdded,
}: MenuSectionProps) {
  const [activeCategory, setActiveCategory] = useState<'all' | string>('all');

  const visibleCategories = useMemo(
    () => filterCategories(categories, query).filter((c) => activeCategory === 'all' || c.id === activeCategory),
    [categories, query, activeCategory],
  );

  const selectCategory = (id: 'all' | string) => {
    setActiveCategory(id);
    document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      {/* Barra de categorías con iconos (pegajosa bajo el header) */}
      <div className={`sticky top-16 z-30 -mx-4 px-4 py-3 backdrop-blur-xl md:-mx-6 md:px-6 ${palette.page}`}>
        <MobileSearch query={query} onQueryChange={onQueryChange} palette={palette} className="mb-3" />

        {categories.length > 0 && (
          <nav
            aria-label="Categorías"
            className={`flex gap-1 overflow-x-auto rounded-sf-lg border p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${palette.softSurface}`}
          >
            <CategoryTab
              label="Todo"
              icon={LayoutGrid}
              active={activeCategory === 'all'}
              onClick={() => selectCategory('all')}
              palette={palette}
            />
            {categories.map((category) => (
              <CategoryTab
                key={category.id}
                label={category.name}
                icon={getCategoryIcon(category.name)}
                active={activeCategory === category.id}
                onClick={() => selectCategory(category.id)}
                palette={palette}
              />
            ))}
          </nav>
        )}
      </div>

      <div className="space-y-14 pb-6 pt-6">
        {visibleCategories.length === 0 ? (
          <MenuEmptyState categories={categories} query={query} onQueryChange={onQueryChange} palette={palette} />
        ) : (
          visibleCategories.map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              palette={palette}
              isClosed={isClosed}
              showViewOnly={activeCategory === 'all' && !query}
              onViewOnly={() => selectCategory(category.id)}
              onAdd={onAdd}
              getQuantity={getQuantity}
              isJustAdded={isJustAdded}
            />
          ))
        )}
      </div>
    </>
  );
}

function CategoryTab({
  label,
  icon: Icon,
  active,
  onClick,
  palette,
}: {
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick: () => void;
  palette: MenuPalette;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="group relative flex min-w-[5.5rem] shrink-0 flex-col items-center gap-1.5 rounded-sf px-3 pb-2.5 pt-2 transition"
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-full border transition ${
          active ? 'border-sf-primary bg-sf-primary text-sf-on-primary shadow-lg shadow-sf-primary/30' : palette.iconCircle
        }`}
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <span
        className={`max-w-[7rem] truncate text-xs ${active ? `font-bold ${palette.heading}` : `font-medium ${palette.body}`}`}
      >
        {label}
      </span>
      <span
        className={`absolute bottom-0 left-1/2 h-0.5 w-10 -translate-x-1/2 rounded-full bg-sf-primary transition-opacity ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden
      />
    </button>
  );
}

function CategorySection({
  category,
  palette,
  isClosed,
  showViewOnly,
  onViewOnly,
  onAdd,
  getQuantity,
  isJustAdded,
}: {
  category: Category;
  palette: MenuPalette;
  isClosed: boolean;
  showViewOnly: boolean;
  onViewOnly: () => void;
  onAdd: (item: MenuItem) => void;
  getQuantity: (id: string) => number;
  isJustAdded: (id: string) => boolean;
}) {
  const Icon = getCategoryIcon(category.name);
  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className={`font-display text-2xl font-black uppercase tracking-tight md:text-3xl ${palette.heading}`}>
            {category.name}
          </h2>
          <p className={`text-sm ${palette.muted}`}>
            {category.items.length} {category.items.length === 1 ? 'opción' : 'opciones'}
          </p>
        </div>
        {showViewOnly && (
          <button
            type="button"
            onClick={onViewOnly}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-sf-primary hover:underline"
          >
            Ver solo esta <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {category.items.length === 0 ? (
        <p className={`text-sm italic ${palette.muted}`}>No hay platos disponibles en esta categoría.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {category.items.map((item) => (
            <ProductCard
              key={item.id}
              item={item}
              fallbackIcon={Icon}
              palette={palette}
              isClosed={isClosed}
              quantity={getQuantity(item.id)}
              justAdded={isJustAdded(item.id)}
              onAdd={() => onAdd(item)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ProductCard({
  item,
  fallbackIcon: FallbackIcon,
  palette,
  isClosed,
  quantity,
  justAdded,
  onAdd,
}: {
  item: MenuItem;
  fallbackIcon: React.ElementType;
  palette: MenuPalette;
  isClosed: boolean;
  quantity: number;
  justAdded: boolean;
  onAdd: () => void;
}) {
  const isSoldOut = !item.isAvailable;
  const disabled = isSoldOut || isClosed;

  return (
    <article
      className={`group flex flex-row overflow-hidden rounded-sf-lg border sm:flex-col transition-all duration-300 ${palette.surface} ${
        isSoldOut ? '' : `${palette.surfaceHover} hover:-translate-y-0.5`
      }`}
    >
      <div className={`relative w-28 shrink-0 overflow-hidden sm:h-44 sm:w-full ${palette.imageBg}`}>
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- imágenes de platos en dominios arbitrarios
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${
              isSoldOut ? 'grayscale' : ''
            }`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FallbackIcon className={`h-10 w-10 sm:h-16 sm:w-16 transition-transform duration-500 group-hover:scale-110 ${palette.placeholderIcon}`} strokeWidth={1.25} />
          </div>
        )}

        {isSoldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45">
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] sm:px-4 sm:py-1.5 sm:text-xs font-black uppercase tracking-wider text-zinc-950 shadow-lg">
              Agotado
            </span>
          </div>
        )}
        {quantity > 0 && (
          <span className="absolute right-2 top-2 rounded-full bg-sf-primary px-2 py-0.5 text-[10px] sm:right-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-[11px] font-bold text-sf-on-primary shadow-lg">
            {quantity} en tu pedido
          </span>
        )}
      </div>

      <div className={`flex min-w-0 flex-1 flex-col p-3.5 sm:p-4 ${isSoldOut ? 'opacity-60' : ''}`}>
        <h3 className={`text-base font-bold leading-snug ${palette.heading}`}>{item.name}</h3>
        {item.description && <p className={`mt-1 line-clamp-2 text-sm ${palette.muted}`}>{item.description}</p>}

        <div className="mt-auto flex items-center justify-between gap-2 pt-3 sm:gap-3 sm:pt-4">
          <p
            className={`whitespace-nowrap font-display text-base font-black sm:text-lg ${isSoldOut ? `line-through ${palette.muted}` : palette.heading}`}
          >
            {formatPrice(item.price)}
          </p>
          <button
            type="button"
            onClick={onAdd}
            disabled={disabled}
            aria-label={isSoldOut ? `${item.name} agotado` : `Agregar ${item.name}`}
            className={`inline-flex shrink-0 items-center gap-1 rounded-sf px-3 py-1.5 text-xs font-bold transition sm:gap-1.5 sm:px-3.5 sm:py-2 sm:text-sm ${
              disabled
                ? 'cursor-not-allowed bg-zinc-500/15 text-zinc-500'
                : justAdded
                  ? 'scale-105 bg-emerald-500 text-white'
                  : 'bg-sf-primary text-sf-on-primary shadow-md shadow-sf-primary/25 hover:bg-sf-primary-hover active:scale-95'
            }`}
          >
            {!disabled && !justAdded && <Plus className="h-4 w-4" />}
            {isSoldOut ? 'Sin stock' : isClosed ? 'Cerrado' : justAdded ? '¡Listo!' : 'Agregar'}
          </button>
        </div>
      </div>
    </article>
  );
}
