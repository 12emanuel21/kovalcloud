import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';

// Fuentes locales (src/app/fonts): el build no depende de la red de Google Fonts
const geistSans = localFont({
  src: './fonts/Geist-Variable.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
  display: 'swap',
});

const geistMono = localFont({
  src: './fonts/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Koval Cloud | Plataforma de Gestión de Restaurantes',
  description: 'Panel de administración, menú digital y pedidos online para restaurantes.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: next-themes pone la clase "dark" en <html> antes de hidratar (tema del dashboard)
    <html
      suppressHydrationWarning
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
