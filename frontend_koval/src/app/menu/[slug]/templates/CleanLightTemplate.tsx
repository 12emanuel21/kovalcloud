'use client';

import React from 'react';
import { PremiumMenuLayout } from './PremiumMenuLayout';
import { LIGHT_PALETTE } from './palettes';
import type { MenuTemplateProps } from './types';

/** Tema "clean-light": fondo crema, tarjetas blancas, acento rojo y hero con borde rasgado */
export const CleanLightTemplate: React.FC<MenuTemplateProps> = (props) => (
  <PremiumMenuLayout {...props} palette={LIGHT_PALETTE} theme="clean-light" />
);
