'use client';

import { useEffect, useState } from 'react';
import { useCart } from '@/context/CartContext';
import { groupBusinessHours, isRestaurantClosed } from '@/lib/business-hours';
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

  // Horario agrupado por días con las mismas franjas (el banner lo muestra como lista)
  const scheduleGroups = groupBusinessHours(restaurant.businessHours);
  const closedNotice =
    restaurant.closedMessage?.trim() ||
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

  return { isClosed, closedNotice, scheduleGroups, handleAddItem, getItemCartQuantity, isJustAdded };
}

export const formatPrice = (price: number) => `$${price.toLocaleString('es-CO')} COP`;
