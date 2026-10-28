'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { formatPrice } from '@/app/menu/[slug]/templates/useMenuLogic';
import type { MenuItem } from '@/app/menu/[slug]/templates/types';
import { DishImage, MenuEmptyState, MobileSearch, filterCategories } from './shared';
import type { MenuSectionProps } from './types';
import { categorySectionId, useCategoryScrollSpy } from './useCategoryScrollSpy';

/**
 * Plantilla "Bistró Tradicional" (bistro-classic), como una carta impresa de restaurante clásico o
 * parrilla: categorías centradas con divisor ✦, platos en líneas "nombre ······ precio" con la
 * descripción en itálica y una miniatura discreta que se amplía al tocarla.
 */
export function BistroClassicTemplate({
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
  const [preview, setPreview] = useState<MenuItem | null>(null);
  const closePreview = useCallback(() => setPreview(null), []);

  return (
    <div className="mx-auto max-w-3xl">
      <MobileSearch query={query} onQueryChange={onQueryChange} palette={palette} className="mb-1" />

      {/* Índice de la carta: categorías en texto, pegajoso bajo el header */}
      {visibleCategories.length > 0 && (
        <nav
          ref={navRef}
          aria-label="Categorías"
          className="sticky top-16 z-20 -mx-4 flex gap-6 overflow-x-auto border-b border-sf-border bg-sf-bg px-4 py-3 [scrollbar-width:none] sm:justify-center md:-mx-6 md:px-6 [&::-webkit-scrollbar]:hidden"
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
                className={`shrink-0 whitespace-nowrap border-b-2 pb-1 font-sf-serif text-sm uppercase tracking-[0.18em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sf-primary ${
                  active ? 'border-sf-primary text-sf-text' : 'border-transparent text-sf-muted hover:text-sf-text'
                }`}
              >
                {category.name}
              </button>
            );
          })}
        </nav>
      )}

      <div className="pb-8">
        {visibleCategories.length === 0 ? (
          <div className="pt-6">
            <MenuEmptyState categories={categories} query={query} onQueryChange={onQueryChange} palette={palette} />
          </div>
        ) : (
          visibleCategories.map((category) => (
            <section key={category.id} id={categorySectionId(category.id)} className="scroll-mt-[8.5rem] pt-10">
              {/* ─── ✦ Categoría ✦ ─── */}
              <header className="mb-6 text-center">
                <div className="flex items-center gap-3" aria-hidden>
                  <span className="h-px flex-1 bg-gradient-to-r from-transparent to-sf-border" />
                  <span className="text-xs text-sf-primary">✦</span>
                  <span className="h-px flex-1 bg-gradient-to-l from-transparent to-sf-border" />
                </div>
                <h2 className="mt-2 font-sf-serif text-2xl font-semibold uppercase tracking-[0.2em] text-sf-text md:text-3xl">
                  {category.name}
                </h2>
              </header>

              {category.items.length === 0 ? (
                <p className="text-center font-sf-serif text-sm italic text-sf-muted">No hay platos disponibles en esta categoría.</p>
              ) : (
                <ul className="space-y-6">
                  {category.items.map((item) => (
                    <BistroDish
                      key={item.id}
                      item={item}
                      isClosed={isClosed}
                      quantity={getQuantity(item.id)}
                      justAdded={isJustAdded(item.id)}
                      onAdd={() => onAdd(item)}
                      onPreview={() => setPreview(item)}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))
        )}
      </div>

      {preview && (
        <PhotoPreview
          item={preview}
          isClosed={isClosed}
          justAdded={isJustAdded(preview.id)}
          onAdd={() => onAdd(preview)}
          onClose={closePreview}
        />
      )}
    </div>
  );
}

/** Estado del botón "+ Pedir" (compartido por la fila y la vista ampliada) */
function orderButton(item: MenuItem, isClosed: boolean, justAdded: boolean) {
  const isSoldOut = !item.isAvailable;
  const disabled = isSoldOut || isClosed;
  return {
    disabled,
    text: isSoldOut ? 'Agotado' : isClosed ? 'Cerrado' : justAdded ? 'Agregado' : '+ Pedir',
    label: isSoldOut ? `${item.name} agotado` : isClosed ? `${item.name}: local cerrado` : `Pedir ${item.name}`,
    className: disabled
      ? 'cursor-not-allowed border-sf-border text-sf-muted'
      : justAdded
        ? 'border-emerald-500 bg-emerald-500 text-white'
        : 'border-sf-primary/50 text-sf-primary hover:bg-sf-primary hover:text-sf-on-primary',
  };
}

function BistroDish({
  item,
  isClosed,
  quantity,
  justAdded,
  onAdd,
  onPreview,
}: {
  item: MenuItem;
  isClosed: boolean;
  quantity: number;
  justAdded: boolean;
  onAdd: () => void;
  onPreview: () => void;
}) {
  const isSoldOut = !item.isAvailable;
  const button = orderButton(item, isClosed, justAdded);

  return (
    <li className="flex items-start gap-4">
      <div className={`min-w-0 flex-1 ${isSoldOut ? 'opacity-60' : ''}`}>
        {/* Nombre ··········· Precio */}
        <div className="flex items-end">
          <h3 className="min-w-0 font-sf-serif text-base font-semibold leading-snug text-sf-text sm:text-lg">{item.name}</h3>
          <span className="mx-3 mb-1.5 min-w-6 flex-1 border-b-2 border-dotted border-sf-border" aria-hidden />
          <span className={`shrink-0 font-sf-serif text-base font-semibold sm:text-lg ${isSoldOut ? 'text-sf-muted line-through' : 'text-sf-primary'}`}>
            {formatPrice(item.price)}
          </span>
        </div>
        {item.description && <p className="mt-1 text-xs italic leading-relaxed text-sf-muted sm:text-sm">{item.description}</p>}
        {(isSoldOut || quantity > 0) && (
          <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider">
            {isSoldOut ? (
              <span className="text-sf-muted">Agotado por hoy</span>
            ) : (
              <span className="text-sf-primary">{quantity} en tu pedido</span>
            )}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-center gap-2">
        {item.imageUrl && (
          <button
            type="button"
            onClick={onPreview}
            aria-label={`Ver foto de ${item.name}`}
            className="h-[72px] w-[72px] overflow-hidden rounded-md border border-sf-border bg-sf-card transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sf-primary"
          >
            <DishImage src={item.imageUrl} alt={item.name} dimmed={isSoldOut} iconClassName="h-6 w-6" />
          </button>
        )}
        <button
          type="button"
          onClick={onAdd}
          disabled={button.disabled}
          aria-label={button.label}
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-sf border px-3 py-1 text-xs font-semibold uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sf-primary ${button.className}`}
        >
          {justAdded && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          {button.text}
        </button>
      </div>
    </li>
  );
}

/** Vista ampliada de la foto: Escape, clic en el fondo o ✕ la cierran */
function PhotoPreview({
  item,
  isClosed,
  justAdded,
  onAdd,
  onClose,
}: {
  item: MenuItem;
  isClosed: boolean;
  justAdded: boolean;
  onAdd: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const button = orderButton(item, isClosed, justAdded);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={item.name}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <figure className="relative w-full max-w-lg overflow-hidden rounded-sf-lg border border-sf-border bg-sf-card shadow-2xl">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Cerrar foto"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="aspect-[4/3] w-full bg-sf-bg">
          <DishImage src={item.imageUrl} alt={item.name} dimmed={!item.isAvailable} iconClassName="h-12 w-12" />
        </div>
        <figcaption className="space-y-2 p-5">
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-sf-serif text-xl font-semibold text-sf-text">{item.name}</p>
            <p className="shrink-0 font-sf-serif text-lg font-semibold text-sf-primary">{formatPrice(item.price)}</p>
          </div>
          {item.description && <p className="text-sm italic leading-relaxed text-sf-muted">{item.description}</p>}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={onAdd}
              disabled={button.disabled}
              aria-label={button.label}
              className={`inline-flex items-center gap-1 rounded-sf border px-4 py-2 text-sm font-semibold uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sf-primary ${button.className}`}
            >
              {justAdded && <Check className="h-4 w-4" strokeWidth={3} />}
              {button.text}
            </button>
          </div>
        </figcaption>
      </figure>
    </div>
  );
}
