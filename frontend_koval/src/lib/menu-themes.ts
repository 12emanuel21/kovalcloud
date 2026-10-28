/**
 * Temas visuales de la carta pública. Deben coincidir con backend_koval/src/restaurants/menu-themes.ts
 * y con los bloques [data-theme="..."] de app/globals.css (variables --storefront-*).
 */
export const MENU_THEMES = [
  {
    value: 'street-burger',
    label: 'Street & Burger',
    description: 'Alto impacto urbano: fondo oscuro y rojo fuego.',
    /** Muestra para la miniatura del selector (mismos valores que globals.css) */
    swatch: { bg: '#09090b', card: '#18181b', border: '#27272a', text: '#ffffff', muted: '#a1a1aa', primary: '#dc2626', radius: '0.5rem' },
  },
  {
    value: 'cafe-bakery',
    label: 'Café & Bakery',
    description: 'Cálido y claro: tonos crema y acento café.',
    swatch: { bg: '#fcfbf9', card: '#ffffff', border: '#e7e5e4', text: '#292524', muted: '#78716c', primary: '#854d0e', radius: '1rem' },
  },
  {
    value: 'sushi-dark',
    label: 'Sushi & Asian',
    description: 'Minimalismo premium: negro mate y verde jade.',
    swatch: { bg: '#030712', card: '#111827', border: '#1f2937', text: '#f9fafb', muted: '#9ca3af', primary: '#059669', radius: '0.25rem' },
  },
  {
    value: 'bistro-grill',
    label: 'Bistró & Parrilla',
    description: 'Elegante clásico: carbón cálido y ámbar dorado.',
    swatch: { bg: '#1c1917', card: '#292524', border: '#44403c', text: '#fafaf9', muted: '#a8a29e', primary: '#d97706', radius: '0.75rem' },
  },
] as const;

export type MenuTheme = (typeof MENU_THEMES)[number]['value'];
export const DEFAULT_MENU_THEME: MenuTheme = 'street-burger';

/** Temas de la primera versión, aún guardados en algunos restaurantes */
const LEGACY_THEMES: Record<string, MenuTheme> = {
  'dark-premium': 'street-burger',
  'clean-light': 'cafe-bakery',
};

export const isMenuTheme = (value: unknown): value is MenuTheme =>
  MENU_THEMES.some((theme) => theme.value === value);

/** Tema válido para pintar la carta: equivalencias de los antiguos y el predeterminado si falta */
export function resolveMenuTheme(value: unknown): MenuTheme {
  if (isMenuTheme(value)) return value;
  return (typeof value === 'string' && LEGACY_THEMES[value]) || DEFAULT_MENU_THEME;
}

/** Temas claros: hero con borde rasgado del color de acento (los oscuros funden la foto con el fondo) */
export const isLightMenuTheme = (theme: MenuTheme) => theme === 'cafe-bakery';
