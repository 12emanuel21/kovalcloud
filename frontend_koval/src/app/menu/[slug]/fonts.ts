import localFont from 'next/font/local';

/** Tipografía de titulares de la carta (clase Tailwind `font-display`). Archivos en src/app/fonts. */
export const displayFont = localFont({
  src: [
    { path: '../../fonts/montserrat-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: '../../fonts/montserrat-latin-800-normal.woff2', weight: '800', style: 'normal' },
    { path: '../../fonts/montserrat-latin-900-normal.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--font-display-family',
  display: 'swap',
});

/*
 * Tipografías elegibles en Ajustes > Perfil (clases .font-<familia> de globals.css). Fuentes variables:
 * todos los pesos en un archivo. Solo Inter (la predeterminada) se precarga; el navegador descarga
 * las demás únicamente si la carta las usa.
 */
export const interFont = localFont({
  src: '../../fonts/inter-latin-wght-normal.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
});

export const oswaldFont = localFont({
  src: '../../fonts/oswald-latin-wght-normal.woff2',
  variable: '--font-oswald',
  weight: '200 700',
  display: 'swap',
  preload: false,
});

export const playfairFont = localFont({
  src: '../../fonts/playfair-display-latin-wght-normal.woff2',
  variable: '--font-playfair',
  weight: '400 900',
  display: 'swap',
  preload: false,
});

export const outfitFont = localFont({
  src: '../../fonts/outfit-latin-wght-normal.woff2',
  variable: '--font-outfit',
  weight: '100 900',
  display: 'swap',
  preload: false,
});

/** Variables CSS de todas las fuentes de la carta (para el contenedor de la carta y la vista previa de Ajustes) */
export const storefrontFontVariables = [displayFont, interFont, oswaldFont, playfairFont, outfitFont]
  .map((font) => font.variable)
  .join(' ');
