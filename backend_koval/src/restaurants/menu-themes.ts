/** Plantillas de la carta pública. Deben coincidir con frontend_koval/src/app/menu/[slug]/templates */
export const MENU_THEMES = ['dark-premium', 'clean-light'] as const;
export type MenuTheme = (typeof MENU_THEMES)[number];
export const DEFAULT_MENU_THEME: MenuTheme = 'dark-premium';
