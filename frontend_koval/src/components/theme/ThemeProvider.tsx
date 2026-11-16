'use client';

import React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

/** Clave propia: el tema es preferencia del panel, no de la carta pública */
export const DASHBOARD_THEME_STORAGE_KEY = 'koval-dashboard-theme';

/** Sin una elección guardada, el panel, el login y la cocina abren en claro */
export const DEFAULT_DASHBOARD_THEME = 'light';

/**
 * Tema claro/oscuro del panel (dashboard, login, cocina): next-themes pone la clase "dark" en <html>
 * (variante dark: de Tailwind) y recuerda la elección con el botón Sol/Luna. Sin elección guardada
 * abre en claro; no sigue el tema del sistema operativo (enableSystem={false}).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={DEFAULT_DASHBOARD_THEME}
      enableSystem={false}
      storageKey={DASHBOARD_THEME_STORAGE_KEY}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
