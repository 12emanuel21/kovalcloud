'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

const subscribe = () => () => {};

/**
 * Interruptor ☀️/🌙 de la carta pública. El modo guardado solo se conoce en el cliente:
 * hasta hidratar se pinta un hueco del mismo tamaño (sin saltos ni avisos de SSR).
 */
export function StorefrontModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  if (!mounted) return <span className="h-10 w-10 shrink-0" aria-hidden />;

  const isDark = resolvedTheme === 'dark';
  const label = isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
  const icon = 'absolute h-[18px] w-[18px] transition-all duration-500 ease-out motion-reduce:transition-none';
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sf-border bg-sf-card/40 text-sf-text transition hover:bg-sf-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sf-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sf-bg"
    >
      <Sun className={`${icon} ${isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0'}`} aria-hidden />
      <Moon className={`${icon} ${isDark ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'}`} aria-hidden />
    </button>
  );
}
