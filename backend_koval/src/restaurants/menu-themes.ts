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
