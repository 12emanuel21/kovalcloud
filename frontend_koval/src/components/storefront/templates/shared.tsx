'use client';

import React from 'react';
import { ChefHat, Search } from 'lucide-react';
import type { MenuPalette } from '@/app/menu/[slug]/templates/palettes';
import type { Category, MenuItem } from '@/app/menu/[slug]/templates/types';

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Búsqueda por nombre o descripción (sin tildes); con búsqueda, se ocultan las categorías sin resultados */
export function filterCategories(categories: Category[], query: string): Category[] {
  const q = normalize(query.trim());
  if (!q) return categories;
  const matches = (item: MenuItem) => normalize(item.name).includes(q) || normalize(item.description ?? '').includes(q);
  return categories
    .map((category) => ({ ...category, items: category.items.filter(matches) }))
    .filter((category) => category.items.length > 0);
}

/** Buscador del móvil (en escritorio está en el header) */
export function MobileSearch({
  query,
  onQueryChange,
  palette,
  className = '',
}: {
  query: string;
  onQueryChange: (query: string) => void;
  palette: MenuPalette;
  className?: string;
}) {
  return (
    <label className={`relative block md:hidden ${className}`}>
      <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${palette.muted}`} />
      <input
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Buscar platos..."
        aria-label="Buscar platos"
        className={`h-11 w-full rounded-sf border pl-9 pr-3 text-sm outline-none transition ${palette.input}`}
      />
    </label>
  );
}

/** Carta sin categorías o búsqueda sin resultados */
export function MenuEmptyState({
  categories,
  query,
  onQueryChange,
  palette,
}: {
  categories: Category[];
  query: string;
  onQueryChange: (query: string) => void;
  palette: MenuPalette;
}) {
  const noCategories = categories.length === 0;
  return (
    <div className={`flex flex-col items-center gap-3 rounded-sf-lg border px-6 py-16 text-center ${palette.softSurface}`}>
      <ChefHat className={`h-10 w-10 ${palette.placeholderIcon}`} strokeWidth={1.5} />
      <p className={`text-sm font-semibold ${palette.heading}`}>
        {noCategories ? 'Este restaurante aún no tiene categorías publicadas.' : `No encontramos platos para "${query.trim()}"`}
      </p>
      {!noCategories && (
        <button type="button" onClick={() => onQueryChange('')} className="text-sm font-bold text-sf-primary hover:underline">
          Limpiar búsqueda
        </button>
      )}
    </div>
  );
}
