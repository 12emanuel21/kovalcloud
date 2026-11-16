import { ThemeProvider } from '@/components/theme/ThemeProvider';

/**
 * Login con el mismo tema que el panel (claro por defecto, o el que eligió el usuario con Sol/Luna).
 * .koval-dashboard activa el modo claro de globals.css, igual que en el dashboard y la cocina.
 */
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div className="koval-dashboard">{children}</div>
    </ThemeProvider>
  );
}
