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
