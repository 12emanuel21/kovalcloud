'use client';

import React from 'react';
import { DEFAULT_MENU_THEME, isMenuTheme, type MenuTheme } from '@/lib/menu-themes';
import { DarkPremiumTemplate } from './templates/DarkPremiumTemplate';
import { CleanLightTemplate } from './templates/CleanLightTemplate';
import type { MenuTemplateProps, RestaurantData } from './templates/types';

export type { Category, MenuItem, RestaurantData } from './templates/types';

const TEMPLATES: Record<MenuTheme, React.FC<MenuTemplateProps>> = {
  'dark-premium': DarkPremiumTemplate,
  'clean-light': CleanLightTemplate,
};

/**
 * Enrutador de temas de la carta pública: elige la plantilla según restaurant.theme.
 * Un tema desconocido o ausente usa el predeterminado (dark-premium).
 */
export const MenuView: React.FC<{ restaurant: RestaurantData; tableNumber?: string }> = ({
  restaurant,
  tableNumber,
}) => {
  const theme = isMenuTheme(restaurant.theme) ? restaurant.theme : DEFAULT_MENU_THEME;
  const Template = TEMPLATES[theme];
  return <Template restaurant={restaurant} categories={restaurant.categories} tableNumber={tableNumber} />;
};
