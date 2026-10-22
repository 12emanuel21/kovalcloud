/**
 * Paletas del layout premium. Las clases van completas (no interpoladas)
 * para que Tailwind las detecte al compilar.
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
  todayRow: string;
  /** Borde rasgado rojo del hero (tema claro) o fundido con el fondo (tema oscuro) */
  heroStyle: 'torn' | 'fade';
  heroFade: string;
  heroPlaceholder: string;
}

export const DARK_PALETTE: MenuPalette = {
  page: 'bg-[#0a0a0b] text-zinc-300',
  nav: 'bg-[#0a0a0b]/85 border-zinc-800/80',
  heading: 'text-white',
  body: 'text-zinc-300',
  muted: 'text-zinc-400',
  surface: 'bg-zinc-900/80 border-zinc-800',
  surfaceHover: 'hover:border-zinc-700 hover:bg-zinc-900',
  softSurface: 'bg-zinc-900/60 border-zinc-800',
  border: 'border-zinc-800',
  input: 'bg-zinc-900 border-zinc-800 text-white placeholder-zinc-500 focus:border-red-500',
  imageBg: 'bg-gradient-to-br from-zinc-800/80 to-zinc-900',
  placeholderIcon: 'text-zinc-700',
  iconCircle: 'border-zinc-700 text-zinc-300 group-hover:border-zinc-500 group-hover:text-white',
  secondaryButton: 'border-zinc-700 text-white hover:bg-zinc-800/80',
  chip: 'bg-zinc-800/80 text-zinc-200 border-zinc-700',
  closedBanner: 'bg-red-950/40 border-red-900/60',
  closedTitle: 'text-white',
  todayRow: 'bg-red-600/10 text-white',
  heroStyle: 'fade',
  heroFade: 'bg-gradient-to-r from-[#0a0a0b] via-[#0a0a0b]/40 to-transparent',
  heroPlaceholder: 'bg-[radial-gradient(circle_at_60%_45%,rgba(220,38,38,0.35),transparent_55%),linear-gradient(135deg,#18181b,#09090b)]',
};

export const LIGHT_PALETTE: MenuPalette = {
  page: 'bg-[#faf8f5] text-slate-600',
  nav: 'bg-white/90 border-slate-200',
  heading: 'text-zinc-950',
  body: 'text-slate-600',
  muted: 'text-slate-500',
  surface: 'bg-white border-slate-200/80 shadow-sm',
  surfaceHover: 'hover:shadow-md hover:border-slate-300/80',
  softSurface: 'bg-white border-slate-200/80',
  border: 'border-slate-200',
  input: 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-red-500',
  imageBg: 'bg-gradient-to-br from-slate-100 to-stone-100',
  placeholderIcon: 'text-slate-300',
  iconCircle: 'border-slate-300 text-slate-700 group-hover:border-slate-400 group-hover:text-zinc-950',
  secondaryButton: 'border-slate-300 bg-white text-zinc-950 hover:bg-slate-50',
  chip: 'bg-white text-slate-700 border-slate-200',
  closedBanner: 'bg-red-50 border-red-200',
  closedTitle: 'text-red-700',
  todayRow: 'bg-red-50 text-zinc-950',
  heroStyle: 'torn',
  heroFade: '',
  heroPlaceholder: 'bg-[radial-gradient(circle_at_60%_45%,rgba(220,38,38,0.45),transparent_55%),linear-gradient(135deg,#1c1917,#0c0a09)]',
};
