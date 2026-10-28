'use client';

import React, { useState } from 'react';
import { ChefHat, Search, UtensilsCrossed } from 'lucide-react';
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

/**
 * Foto del plato (item.imageUrl) que llena su contenedor. Sin foto, o si el enlace falla,
 * un placeholder tenue con cubiertos: el espacio de la imagen nunca se colapsa.
 */
export function DishImage({
  src,
  alt,
  dimmed = false,
  iconClassName = 'h-7 w-7',
}: {
  src?: string | null;
  alt: string;
  dimmed?: boolean;
  iconClassName?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (src && failedSrc !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- imágenes de platos en dominios arbitrarios
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFailedSrc(src)}
        // La carta se renderiza en el servidor: si la foto falló antes de hidratar, onError ya no
        // se dispara. Al montar se revisa si quedó rota (cargada sin dimensiones).
        ref={(img) => {
          if (img?.complete && img.naturalWidth === 0) setFailedSrc(src);
        }}
        className={`h-full w-full object-cover ${dimmed ? 'grayscale' : ''}`}
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sf-border/40 to-sf-card" aria-hidden>
      <UtensilsCrossed className={`${iconClassName} text-sf-muted/50`} strokeWidth={1.5} />
    </div>
  );
}
