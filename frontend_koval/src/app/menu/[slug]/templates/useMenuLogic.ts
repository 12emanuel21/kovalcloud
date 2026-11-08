'use client';

import { useEffect, useState } from 'react';
import { useCart } from '@/context/CartContext';
import { groupBusinessHours, isRestaurantClosed } from '@/lib/business-hours';
import type { MenuItem, RestaurantData } from './types';

/** Campos que deciden si el local recibe pedidos (GET /restaurants/slug/:slug/status) */
export type OpeningStatus = Pick<RestaurantData, 'isTemporarilyClosed' | 'closedMessage' | 'businessHours' | 'extendedUntil'>;

/** Cada cuánto la carta vuelve a consultar el estado (prórroga, "Cerrar ahora", emergencia) */
const STATUS_POLL_MS = 15_000;

const openingOf = (data: OpeningStatus): OpeningStatus => ({
  isTemporarilyClosed: data.isTemporarilyClosed,
  closedMessage: data.closedMessage,
  businessHours: data.businessHours,
  extendedUntil: data.extendedUntil,
});

/**
 * Lógica compartida por todas las plantillas: estado de apertura, aviso de cierre,
 * carrito y feedback de "agregado". Las plantillas solo deciden el aspecto visual.
 */
export function useMenuLogic(restaurant: RestaurantData) {
  const { addItem, items: cartItems } = useCart();
  const [addedItemIds, setAddedItemIds] = useState<{ [key: string]: boolean }>({});

  // Estado de apertura en vivo: el de la carga inicial hasta que llega la primera consulta.
  // Así una prórroga, su fin ("Cerrar ahora") o el cierre de emergencia se reflejan en segundos.
  const [live, setLive] = useState<{ slug: string; status: OpeningStatus } | null>(null);
  const opening = live && live.slug === restaurant.slug ? live.status : openingOf(restaurant);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      setNow(Date.now());
      // Pestaña en segundo plano: solo avanza el reloj; se consulta al volver
      if (document.visibilityState !== 'visible') return;
      fetch(`/api/restaurants/slug/${encodeURIComponent(restaurant.slug)}/status`, { cache: 'no-store' })
        .then((res) => (res.ok ? (res.json() as Promise<OpeningStatus>) : null))
        .then((data) => {
          if (!cancelled && data) setLive({ slug: restaurant.slug, status: openingOf(data) });
        })
        .catch(() => {
          // Sin red se mantiene el último estado conocido; el backend valida igual al pedir
        });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const interval = setInterval(refresh, STATUS_POLL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [restaurant.slug]);

  // Cerrado por botón de emergencia o fuera de horario (hora del local), salvo prórroga vigente
  const isClosed = isRestaurantClosed(opening, new Date(now));

  // Horario agrupado por días con las mismas franjas (el banner lo muestra como lista)
  const scheduleGroups = groupBusinessHours(opening.businessHours);
  const closedNotice =
    opening.closedMessage?.trim() ||
    (scheduleGroups.length
      ? 'En este momento estamos cerrados. Te esperamos en nuestro horario de atención.'
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

  const isJustAdded = (id: string) => Boolean(addedItemIds[id]);

  return { isClosed, opening, closedNotice, scheduleGroups, handleAddItem, getItemCartQuantity, isJustAdded };
}

export const formatPrice = (price: number) => `$${price.toLocaleString('es-CO')} COP`;
