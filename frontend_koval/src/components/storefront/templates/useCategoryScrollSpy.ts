'use client';

import { useEffect, useRef, useState } from 'react';
import type { Category } from '@/app/menu/[slug]/templates/types';

/** id del ancla de cada categoría (las plantillas lo ponen en su <section>) */
export const categorySectionId = (categoryId: string) => `categoria-${categoryId}`;

/**
 * Navegación por categorías con scroll: salto suave a la sección, resaltado de la categoría en
 * pantalla (la última cuyo título ya pasó bajo la barra pegajosa) y la barra se desplaza sola
 * para que el elemento activo quede visible. Lo comparten la lista compacta y el bistró.
 */
export function useCategoryScrollSpy(visibleCategories: Category[]) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  // Durante el scroll suave tras un clic no se van marcando las categorías intermedias
  const scrollLock = useRef<number | null>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (scrollLock.current !== null) return;
      const threshold = (navRef.current?.getBoundingClientRect().bottom ?? 128) + 24;
      let current: string | null = null;
      for (const category of visibleCategories) {
        const section = document.getElementById(categorySectionId(category.id));
        if (section && section.getBoundingClientRect().top <= threshold) current = category.id;
      }
      setActiveId(current);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [visibleCategories]);

  useEffect(() => () => {
    if (scrollLock.current !== null) window.clearTimeout(scrollLock.current);
  }, []);

  const currentId = activeId && visibleCategories.some((c) => c.id === activeId) ? activeId : visibleCategories[0]?.id;

  // Solo se desplaza la barra (scrollIntoView interrumpiría el scroll suave de la página)
  useEffect(() => {
    const nav = navRef.current;
    const item = currentId ? itemRefs.current.get(currentId) : undefined;
    if (nav && item) nav.scrollTo({ left: item.offsetLeft - (nav.clientWidth - item.clientWidth) / 2, behavior: 'smooth' });
  }, [currentId]);

  const goToCategory = (id: string) => {
    setActiveId(id);
    if (scrollLock.current !== null) window.clearTimeout(scrollLock.current);
    scrollLock.current = window.setTimeout(() => {
      scrollLock.current = null;
    }, 900);
    document.getElementById(categorySectionId(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /** ref para cada botón de la barra (para mantener visible el activo) */
  const registerItem = (id: string) => (el: HTMLElement | null) => {
    if (el) itemRefs.current.set(id, el);
    else itemRefs.current.delete(id);
  };

  return { navRef, currentId, goToCategory, registerItem };
}
