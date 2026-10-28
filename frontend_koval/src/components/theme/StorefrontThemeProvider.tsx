'use client';

import React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

/** Preferencia del cliente en la carta pública (distinta de la del panel: koval-dashboard-theme) */
export const STOREFRONT_MODE_STORAGE_KEY = 'koval-menu-mode';

/**
 * Modo claro/oscuro de la carta pública: next-themes pone la clase "dark" en <html> y las variables
 * --storefront-* de cada tema cambian (globals.css). Hasta que el cliente elija, manda el modo
 * natural del tema del restaurante (Café & Bakery claro; el resto oscuro).
 */
export function StorefrontThemeProvider({
  defaultMode,
  children,
}: {
  defaultMode: 'light' | 'dark';
  children: React.ReactNode;
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={defaultMode}
      enableSystem={false}
      storageKey={STOREFRONT_MODE_STORAGE_KEY}
    >
      {children}
    </NextThemesProvider>
  );
}
