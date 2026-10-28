import type React from 'react';

/**
 * Temas visuales de la carta pública. Deben coincidir con backend_koval/src/restaurants/menu-themes.ts
 * y con los bloques [data-theme="..."] de app/globals.css (variables --storefront-*).
 */
export const MENU_COLOR_MODES = [
  { value: 'light', label: 'Claro', icon: '☀️' },
  { value: 'dark', label: 'Oscuro', icon: '🌙' },
] as const;

export type MenuColorMode = (typeof MENU_COLOR_MODES)[number]['value'];

/** Muestra para la miniatura del selector (mismos valores que globals.css) */
export interface ThemeSwatch {
  bg: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
}

export const MENU_THEMES = [
  {
    value: 'street-burger',
    label: 'Street & Burger',
    description: 'Alto impacto urbano: rojo fuego.',
    radius: '0.5rem',
    swatches: {
      dark: { bg: '#09090b', card: '#18181b', border: '#27272a', text: '#ffffff', muted: '#a1a1aa', primary: '#dc2626' },
      light: { bg: '#fafafa', card: '#ffffff', border: '#e4e4e7', text: '#18181b', muted: '#71717a', primary: '#dc2626' },
    },
  },
  {
    value: 'cafe-bakery',
    label: 'Café & Bakery',
    description: 'Cálido: tonos crema y acento café.',
    radius: '1rem',
    swatches: {
      light: { bg: '#fcfbf9', card: '#ffffff', border: '#e7e5e4', text: '#292524', muted: '#78716c', primary: '#854d0e' },
      dark: { bg: '#1a1411', card: '#261e19', border: '#3d322a', text: '#faf7f2', muted: '#b3a79c', primary: '#d9a066' },
    },
  },
  {
    value: 'sushi-dark',
    label: 'Sushi & Asian',
    description: 'Minimalismo premium: verde jade.',
    radius: '0.25rem',
    swatches: {
      dark: { bg: '#030712', card: '#111827', border: '#1f2937', text: '#f9fafb', muted: '#9ca3af', primary: '#059669' },
      light: { bg: '#f9fafb', card: '#ffffff', border: '#e5e7eb', text: '#111827', muted: '#6b7280', primary: '#047857' },
    },
  },
  {
    value: 'bistro-grill',
    label: 'Bistró & Parrilla',
    description: 'Elegante clásico: ámbar dorado.',
    radius: '0.75rem',
    swatches: {
      dark: { bg: '#1c1917', card: '#292524', border: '#44403c', text: '#fafaf9', muted: '#a8a29e', primary: '#d97706' },
      light: { bg: '#fafaf9', card: '#ffffff', border: '#e7e5e4', text: '#1c1917', muted: '#78716c', primary: '#b45309' },
    },
  },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  description: string;
  radius: string;
  swatches: Record<MenuColorMode, ThemeSwatch>;
}>;

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

/** Tema de estética clara: hero con borde rasgado del color de acento (los oscuros funden la foto) */
export const isLightMenuTheme = (theme: MenuTheme) => theme === 'cafe-bakery';

/** Modo con el que abre la carta: el elegido por el dueño o, si falta, el natural del tema */
export function resolveMenuColorMode(mode: unknown, theme: unknown): MenuColorMode {
  if (mode === 'light' || mode === 'dark') return mode;
  return isLightMenuTheme(resolveMenuTheme(theme)) ? 'light' : 'dark';
}

/** Estructura de la carta (cómo se disponen los platos). Deben coincidir con el backend (menu-themes.ts) */
export const MENU_LAYOUTS = [
  {
    value: 'visual-grid',
    label: 'Cuadrícula Visual (Grid)',
    description: 'Ideal para hamburguesas, pizzas y locales donde la foto grande es protagonista.',
  },
  {
    value: 'compact-row',
    label: 'Lista Compacta (Compact Row)',
    description: 'Estilo delivery moderno / sushi. Ideal para cartas extensas con muchos platos.',
  },
  {
    value: 'bistro-classic',
    label: 'Bistró Tradicional',
    description: 'Estilo restaurante clásico / parrilla. Líneas punteadas, tipografía sobria y fotos elegantes.',
  },
  {
    value: 'modern-tabs',
    label: 'Pestañas Modernas (App Tabs)',
    description: 'Estilo app delivery. Navegación por pestañas limpias sin scroll infinito.',
  },
] as const;

export type MenuLayout = (typeof MENU_LAYOUTS)[number]['value'];
export const DEFAULT_MENU_LAYOUT: MenuLayout = 'visual-grid';

export const resolveMenuLayout = (value: unknown): MenuLayout =>
  MENU_LAYOUTS.some((layout) => layout.value === value) ? (value as MenuLayout) : DEFAULT_MENU_LAYOUT;

/** Tipografías de la carta (clases .font-<valor> de globals.css). Deben coincidir con el backend */
export const MENU_FONTS = [
  { value: 'sans-modern', label: 'Sans Moderna', sample: 'Inter + Montserrat · limpia y versátil' },
  { value: 'street-urban', label: 'Urbana Display', sample: 'Oswald · condensada, alto impacto' },
  { value: 'serif-elegant', label: 'Serif Elegante', sample: 'Playfair Display · editorial y sofisticada' },
  { value: 'warm-rounded', label: 'Redondeada Cálida', sample: 'Outfit · amable y cercana' },
] as const;

export type MenuFont = (typeof MENU_FONTS)[number]['value'];
export const DEFAULT_MENU_FONT: MenuFont = 'sans-modern';

export const resolveMenuFont = (value: unknown): MenuFont =>
  MENU_FONTS.some((font) => font.value === value) ? (value as MenuFont) : DEFAULT_MENU_FONT;

/** Colores sugeridos para el acento propio (los de los 4 temas) */
export const ACCENT_PRESETS = [
  { value: '#dc2626', label: 'Rojo fuego' },
  { value: '#854d0e', label: 'Café caramelo' },
  { value: '#059669', label: 'Verde jade' },
  { value: '#d97706', label: 'Ámbar dorado' },
] as const;

export const isHexColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);

/** Luminancia relativa WCAG de un #RRGGBB */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre dos colores #RRGGBB (1 a 21) */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Variables del acento propio para el contenedor de la carta (pisan las del tema en claro y oscuro):
 * hover un poco más oscuro y texto del botón blanco o casi negro, el que contraste más.
 */
export function customAccentStyle(color: string | null | undefined): React.CSSProperties | undefined {
  if (!isHexColor(color)) return undefined;
  const onPrimary = contrastRatio(color, '#ffffff') >= contrastRatio(color, '#111111') ? '#ffffff' : '#111111';
  return {
    '--storefront-primary': color,
    '--storefront-primary-hover': `color-mix(in srgb, ${color} 82%, black)`,
    '--storefront-primary-text': onPrimary,
  } as React.CSSProperties;
}
