/**
 * Paleta del layout premium. Las clases van completas (no interpoladas) para que Tailwind
 * las detecte al compilar, y leen el tema activo (variables --storefront-* de [data-theme]).
 */
export interface MenuPalette {
  page: string;
  nav: string;
  heading: string;
  body: string;
  muted: string;
  surface: string;
  surfaceHover: string;
  softSurface: string;
  border: string;
  input: string;
  imageBg: string;
  placeholderIcon: string;
  iconCircle: string;
  secondaryButton: string;
  chip: string;
  closedBanner: string;
  closedTitle: string;
  /** Texto y horarios dentro del banner de cerrado (legible sobre su fondo) */
  closedText: string;
  closedDivider: string;
  todayRow: string;
  /** Borde rasgado del color de acento (tema claro) o fundido con el fondo (temas oscuros) */
  heroStyle: 'torn' | 'fade';
  heroFade: string;
  heroPlaceholder: string;
}

const STOREFRONT_CLASSES: Omit<MenuPalette, 'heroStyle'> = {
  page: 'bg-sf-bg text-sf-body',
  nav: 'bg-sf-bg/85 border-sf-border',
  heading: 'text-sf-text',
  body: 'text-sf-body',
  muted: 'text-sf-muted',
  surface: 'bg-sf-card border-sf-border shadow-sm',
  surfaceHover: 'hover:shadow-md hover:border-sf-muted/50',
  softSurface: 'bg-sf-card/70 border-sf-border',
  border: 'border-sf-border',
  input: 'bg-sf-card border-sf-border text-sf-text placeholder-sf-muted focus:border-sf-primary',
  imageBg: 'bg-gradient-to-br from-sf-border/70 to-sf-card',
  placeholderIcon: 'text-sf-muted/40',
  iconCircle: 'border-sf-border text-sf-body group-hover:border-sf-muted group-hover:text-sf-text',
  secondaryButton: 'border-sf-border bg-sf-card/40 text-sf-text hover:bg-sf-card',
  chip: 'bg-sf-card text-sf-body border-sf-border',
  closedBanner: 'bg-sf-primary/10 border-sf-primary/40',
  closedTitle: 'text-sf-text',
  closedText: 'text-sf-body',
  closedDivider: 'border-sf-primary/30',
  todayRow: 'bg-sf-primary/10 text-sf-text',
  heroFade: 'bg-gradient-to-r from-sf-bg via-sf-bg/40 to-transparent',
  // Siempre oscuro (contraste del logo y las etiquetas blancas), con el brillo del color de acento
  heroPlaceholder:
    'bg-[radial-gradient(circle_at_60%_45%,color-mix(in_srgb,var(--storefront-primary)_40%,transparent),transparent_55%),linear-gradient(135deg,#1c1917,#09090b)]',
};

export const STOREFRONT_PALETTE: MenuPalette = { ...STOREFRONT_CLASSES, heroStyle: 'fade' };
export const STOREFRONT_LIGHT_PALETTE: MenuPalette = { ...STOREFRONT_CLASSES, heroStyle: 'torn' };
