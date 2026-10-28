'use client';

import React from 'react';
import { isLightMenuTheme, resolveMenuTheme } from '@/lib/menu-themes';
import { PremiumMenuLayout } from './templates/PremiumMenuLayout';
import { STOREFRONT_LIGHT_PALETTE, STOREFRONT_PALETTE } from './templates/palettes';
import type { RestaurantData } from './templates/types';

export type { Category, MenuItem, RestaurantData } from './templates/types';

/**
 * Carta pública con el tema visual del restaurante: data-theme activa sus variables --storefront-*
 * (globals.css). Un tema desconocido o ausente usa el predeterminado (street-burger).
 */
export const MenuView: React.FC<{ restaurant: RestaurantData; tableNumber?: string; returnedOrderId?: string }> = ({
  restaurant,
  tableNumber,
  returnedOrderId,
}) => {
  const theme = resolveMenuTheme(restaurant.theme);
  return (
    <div data-theme={theme}>
      <PremiumMenuLayout
        restaurant={restaurant}
        categories={restaurant.categories}
        tableNumber={tableNumber}
        returnedOrderId={returnedOrderId}
        palette={isLightMenuTheme(theme) ? STOREFRONT_LIGHT_PALETTE : STOREFRONT_PALETTE}
        theme={theme}
      />
    </div>
  );
};
