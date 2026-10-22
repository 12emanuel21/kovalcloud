import { Montserrat } from 'next/font/google';

/** Tipografía de titulares de la carta (clase Tailwind `font-display`) */
export const displayFont = Montserrat({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  variable: '--font-display-family',
  display: 'swap',
});
