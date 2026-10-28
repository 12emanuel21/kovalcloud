'use client';

import React from 'react';
import { isLightMenuTheme, resolveMenuColorMode, resolveMenuLayout, resolveMenuTheme } from '@/lib/menu-themes';
import { StorefrontThemeProvider } from '@/components/theme/StorefrontThemeProvider';
import { BistroClassicTemplate } from '@/components/storefront/templates/BistroClassicTemplate';
import { CompactRowTemplate } from '@/components/storefront/templates/CompactRowTemplate';
import { VisualGridTemplate } from '@/components/storefront/templates/VisualGridTemplate';
import { PremiumMenuLayout } from './templates/PremiumMenuLayout';
import { STOREFRONT_LIGHT_PALETTE, STOREFRONT_PALETTE } from './templates/palettes';
import type { RestaurantData } from './templates/types';

export type { Category, MenuItem, RestaurantData } from './templates/types';

/**
 * Carta pública con el tema visual del restaurante: data-theme activa sus variables --storefront-*
 * (globals.css). Un tema desconocido o ausente usa el predeterminado (street-burger).
 * Abre en el modo que eligió el dueño (Ajustes > Perfil) y el cliente puede alternarlo (☀️/🌙).
 * La estructura de los platos (restaurant.layout) elige la plantilla: cuadrícula visual, lista compacta
 * o bistró tradicional.
 */
export const MenuView: React.FC<{ restaurant: RestaurantData; tableNumber?: string; returnedOrderId?: string }> = ({
  restaurant,
  tableNumber,
  returnedOrderId,
}) => {
  const theme = resolveMenuTheme(restaurant.theme);
  const light = isLightMenuTheme(theme);
  const layout = resolveMenuLayout(restaurant.layout);
  return (
    <StorefrontThemeProvider
      restaurantId={restaurant.id}
      defaultMode={resolveMenuColorMode(restaurant.menuColorMode, theme)}
    >
      <div data-theme={theme}>
        <PremiumMenuLayout
          restaurant={restaurant}
          categories={restaurant.categories}
          tableNumber={tableNumber}
          returnedOrderId={returnedOrderId}
          palette={light ? STOREFRONT_LIGHT_PALETTE : STOREFRONT_PALETTE}
          theme={theme}
          renderMenu={(props) =>
            layout === 'compact-row' ? (
              <CompactRowTemplate {...props} />
            ) : layout === 'bistro-classic' ? (
              <BistroClassicTemplate {...props} />
            ) : (
              <VisualGridTemplate {...props} />
            )
          }
        />
      </div>
    </StorefrontThemeProvider>
  );
};
