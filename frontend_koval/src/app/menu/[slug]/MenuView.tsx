'use client';

import React from 'react';
import {
  customAccentStyle,
  isLightMenuTheme,
  resolveMenuColorMode,
  resolveMenuFont,
  resolveMenuLayout,
  resolveMenuTheme,
} from '@/lib/menu-themes';
import { StorefrontThemeProvider } from '@/components/theme/StorefrontThemeProvider';
import { BistroClassicTemplate } from '@/components/storefront/templates/BistroClassicTemplate';
import { CompactRowTemplate } from '@/components/storefront/templates/CompactRowTemplate';
import { ModernTabsTemplate } from '@/components/storefront/templates/ModernTabsTemplate';
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
 * bistró tradicional o pestañas modernas. El dueño puede fijar su propio color de acento y la tipografía.
 */
export const MenuView: React.FC<{ restaurant: RestaurantData; tableNumber?: string; returnedOrderId?: string }> = ({
  restaurant,
  tableNumber,
  returnedOrderId,
}) => {
  const theme = resolveMenuTheme(restaurant.theme);
  const light = isLightMenuTheme(theme);
  const layout = resolveMenuLayout(restaurant.layout);
  const font = resolveMenuFont(restaurant.fontFamily);
  // Titulares en serif con peso sobrio: el Bistró los exige para no chocar con su carta editorial
  const editorial = layout === 'bistro-classic' || font === 'serif-elegant';
  return (
    <StorefrontThemeProvider
      restaurantId={restaurant.id}
      defaultMode={resolveMenuColorMode(restaurant.menuColorMode, theme)}
    >
      <div
        data-theme={theme}
        className={`font-${font}${editorial ? ' sf-editorial' : ''}`}
        style={customAccentStyle(restaurant.customColor)}
      >
        <PremiumMenuLayout
          restaurant={restaurant}
          categories={restaurant.categories}
          tableNumber={tableNumber}
          returnedOrderId={returnedOrderId}
          palette={light ? STOREFRONT_LIGHT_PALETTE : STOREFRONT_PALETTE}
          renderMenu={(props) =>
            layout === 'compact-row' ? (
              <CompactRowTemplate {...props} />
            ) : layout === 'bistro-classic' ? (
              <BistroClassicTemplate {...props} />
            ) : layout === 'modern-tabs' ? (
              <ModernTabsTemplate {...props} />
            ) : (
              <VisualGridTemplate {...props} />
            )
          }
        />
      </div>
    </StorefrontThemeProvider>
  );
};
