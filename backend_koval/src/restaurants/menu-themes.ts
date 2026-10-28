/**
 * Temas visuales de la carta pública. Deben coincidir con frontend_koval/src/lib/menu-themes.ts
 * y con los bloques [data-theme="..."] de frontend_koval/src/app/globals.css.
 */
export const MENU_THEMES = ['street-burger', 'cafe-bakery', 'sushi-dark', 'bistro-grill'] as const;
export type MenuTheme = (typeof MENU_THEMES)[number];
export const DEFAULT_MENU_THEME: MenuTheme = 'street-burger';

/** Temas de la primera versión (la migración add_storefront_themes los convierte; por si acaso) */
const LEGACY_THEMES: Record<string, MenuTheme> = {
  'dark-premium': 'street-burger',
  'clean-light': 'cafe-bakery',
};

/** Tema para la carta pública: equivalencia de los antiguos y el predeterminado si falta o no existe */
export function resolveMenuTheme(theme: string | null | undefined): MenuTheme {
  if (theme && (MENU_THEMES as readonly string[]).includes(theme)) return theme as MenuTheme;
  return (theme && LEGACY_THEMES[theme]) || DEFAULT_MENU_THEME;
}

/** Modo con el que abre la carta pública; el cliente lo cambia después con el botón ☀️/🌙 */
export const MENU_COLOR_MODES = ['light', 'dark'] as const;
export type MenuColorMode = (typeof MENU_COLOR_MODES)[number];

/** Modo válido para la carta: el elegido por el dueño o, si falta, el natural del tema */
export function resolveMenuColorMode(mode: string | null | undefined, theme: string | null | undefined): MenuColorMode {
  if (mode && (MENU_COLOR_MODES as readonly string[]).includes(mode)) return mode as MenuColorMode;
  return resolveMenuTheme(theme) === 'cafe-bakery' ? 'light' : 'dark';
}

/**
 * Estructura de la carta pública (cómo se disponen los platos). Deben coincidir con
 * frontend_koval/src/components/storefront/templates.
 */
export const MENU_LAYOUTS = ['visual-grid', 'compact-row', 'bistro-classic', 'modern-tabs'] as const;
export type MenuLayout = (typeof MENU_LAYOUTS)[number];
export const DEFAULT_MENU_LAYOUT: MenuLayout = 'visual-grid';

export function resolveMenuLayout(layout: string | null | undefined): MenuLayout {
  return layout && (MENU_LAYOUTS as readonly string[]).includes(layout) ? (layout as MenuLayout) : DEFAULT_MENU_LAYOUT;
}

/** Tipografías de la carta (clases .font-<valor> de frontend_koval/src/app/globals.css) */
export const MENU_FONTS = ['sans-modern', 'street-urban', 'serif-elegant', 'warm-rounded'] as const;
export type MenuFont = (typeof MENU_FONTS)[number];
export const DEFAULT_MENU_FONT: MenuFont = 'sans-modern';

export function resolveMenuFont(font: string | null | undefined): MenuFont {
  return font && (MENU_FONTS as readonly string[]).includes(font) ? (font as MenuFont) : DEFAULT_MENU_FONT;
}

/** Color de acento propio: HEX #RRGGBB */
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** Color propio válido en minúsculas, o null (la carta usa el acento del tema) */
export function normalizeCustomColor(color: string | null | undefined): string | null {
  return color && HEX_COLOR_PATTERN.test(color) ? color.toLowerCase() : null;
}
