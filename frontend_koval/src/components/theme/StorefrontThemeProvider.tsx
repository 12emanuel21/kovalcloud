'use client';

import React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

/**
 * Preferencia del cliente en la carta pública (distinta de la del panel: koval-dashboard-theme).
 * Va por restaurante y por el modo que configuró el dueño: si el dueño lo cambia en Ajustes,
 * la carta vuelve a abrir como él la configuró, aunque antes alguien hubiera usado el botón.
 */
export const storefrontModeStorageKey = (restaurantId: string, defaultMode: 'light' | 'dark') =>
  `koval-menu-mode:${restaurantId}:${defaultMode}`;

/**
 * Modo claro/oscuro de la carta pública: next-themes pone la clase "dark" en <html> y las variables
 * --storefront-* de cada tema cambian (globals.css). Hasta que el cliente elija, manda el modo
 * que configuró el dueño en Ajustes > Perfil.
 */
export function StorefrontThemeProvider({
  restaurantId,
  defaultMode,
  children,
}: {
  restaurantId: string;
  defaultMode: 'light' | 'dark';
  children: React.ReactNode;
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={defaultMode}
      enableSystem={false}
      storageKey={storefrontModeStorageKey(restaurantId, defaultMode)}
    >
      {children}
    </NextThemesProvider>
  );
}
