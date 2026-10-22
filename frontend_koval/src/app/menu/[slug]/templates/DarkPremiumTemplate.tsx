'use client';

import React from 'react';
import { PremiumMenuLayout } from './PremiumMenuLayout';
import { DARK_PALETTE } from './palettes';
import type { MenuTemplateProps } from './types';

/** Tema "dark-premium": fondo casi negro, superficies zinc y acento rojo */
export const DarkPremiumTemplate: React.FC<MenuTemplateProps> = (props) => (
  <PremiumMenuLayout {...props} palette={DARK_PALETTE} theme="dark-premium" />
);
