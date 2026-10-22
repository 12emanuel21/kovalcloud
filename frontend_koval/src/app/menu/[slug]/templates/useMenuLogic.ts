'use client';

import { useEffect, useState } from 'react';
import { useCart } from '@/context/CartContext';
import { formatBusinessHours, isRestaurantClosed } from '@/lib/business-hours';
import type { MenuItem, RestaurantData } from './types';

/**
 * Lógica compartida por todas las plantillas: estado de apertura, aviso de cierre,
 * carrito y feedback de "agregado". Las plantillas solo deciden el aspecto visual.
 */
export function useMenuLogic(restaurant: RestaurantData) {
  const { addItem, items: cartItems } = useCart();
  const [addedItemIds, setAddedItemIds] = useState<{ [key: string]: boolean }>({});

  // Cerrado por botón de emergencia o fuera de horario (hora del local). Se reevalúa cada minuto.
  const [isClosed, setIsClosed] = useState(() => isRestaurantClosed(restaurant));
  useEffect(() => {
    const interval = setInterval(() => setIsClosed(isRestaurantClosed(restaurant)), 60_000);
    return () => clearInterval(interval);
  }, [restaurant]);

  const schedule = formatBusinessHours(restaurant.businessHours);
  const closedNotice =
    restaurant.closedMessage?.trim() ||
    (schedule
      ? `En este momento estamos cerrados. Nuestro horario: ${schedule}.`
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

  return { isClosed, closedNotice, handleAddItem, getItemCartQuantity, isJustAdded };
}

export const formatPrice = (price: number) => `$${price.toLocaleString('es-CO')} COP`;
