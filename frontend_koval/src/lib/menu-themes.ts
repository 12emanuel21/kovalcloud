/** Plantillas de la carta pública. Deben coincidir con backend_koval/src/restaurants/menu-themes.ts */
export const MENU_THEMES = [
  { value: 'dark-premium', label: 'Dark Premium (Oscuro)' },
  { value: 'clean-light', label: 'Clean Light (Claro)' },
] as const;

export type MenuTheme = (typeof MENU_THEMES)[number]['value'];
export const DEFAULT_MENU_THEME: MenuTheme = 'dark-premium';

export const isMenuTheme = (value: unknown): value is MenuTheme =>
  MENU_THEMES.some((theme) => theme.value === value);
