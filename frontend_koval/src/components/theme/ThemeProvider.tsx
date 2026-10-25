'use client';

import React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

/** Clave propia: el tema es preferencia del panel, no de la carta pública */
export const DASHBOARD_THEME_STORAGE_KEY = 'koval-dashboard-theme';

/**
 * Tema claro/oscuro del dashboard: next-themes pone la clase "dark" en <html> (variante dark: de
 * Tailwind) y recuerda la elección. Por defecto oscuro, el diseño original del panel.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey={DASHBOARD_THEME_STORAGE_KEY}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
