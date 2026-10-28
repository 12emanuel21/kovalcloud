'use client';

import React from 'react';
import { isLightMenuTheme, resolveMenuTheme } from '@/lib/menu-themes';
import { StorefrontThemeProvider } from '@/components/theme/StorefrontThemeProvider';
import { PremiumMenuLayout } from './templates/PremiumMenuLayout';
import { STOREFRONT_LIGHT_PALETTE, STOREFRONT_PALETTE } from './templates/palettes';
import type { RestaurantData } from './templates/types';

export type { Category, MenuItem, RestaurantData } from './templates/types';

/**
 * Carta pública con el tema visual del restaurante: data-theme activa sus variables --storefront-*
 * (globals.css). Un tema desconocido o ausente usa el predeterminado (street-burger).
 * El cliente puede alternar claro/oscuro (☀️/🌙); por defecto, el modo natural del tema.
 */
export const MenuView: React.FC<{ restaurant: RestaurantData; tableNumber?: string; returnedOrderId?: string }> = ({
  restaurant,
  tableNumber,
  returnedOrderId,
}) => {
  const theme = resolveMenuTheme(restaurant.theme);
  const light = isLightMenuTheme(theme);
  return (
    <StorefrontThemeProvider defaultMode={light ? 'light' : 'dark'}>
      <div data-theme={theme}>
        <PremiumMenuLayout
          restaurant={restaurant}
          categories={restaurant.categories}
          tableNumber={tableNumber}
          returnedOrderId={returnedOrderId}
          palette={light ? STOREFRONT_LIGHT_PALETTE : STOREFRONT_PALETTE}
          theme={theme}
        />
      </div>
    </StorefrontThemeProvider>
  );
};
