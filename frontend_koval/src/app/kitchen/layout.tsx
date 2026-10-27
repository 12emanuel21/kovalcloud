import { ThemeProvider } from '@/components/theme/ThemeProvider';

/**
 * Monitor de Cocina (KDS): fuera del layout del dashboard, pero con el mismo tema claro/oscuro.
 * .koval-dashboard activa el modo claro de globals.css (misma preferencia guardada que el panel).
 */
export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div className="koval-dashboard">{children}</div>
    </ThemeProvider>
  );
}
