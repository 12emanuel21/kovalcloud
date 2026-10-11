import {
  LayoutDashboard,
  SquareMenu,
  ShoppingBag,
  MonitorPlay,
  MessageSquare,
  Settings,
  QrCode,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Se abre en una pestaña nueva (pantallas completas fuera del dashboard) */
  external?: boolean;
}

/**
 * Navegación principal del dashboard. Fuente única para Sidebar y TopBar.
 * `restaurantId` se usa para construir rutas que dependen del tenant (KDS).
 */
export function getNavItems(restaurantId?: string): NavItem[] {
  return [
    { label: 'Vista General', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Gestión de Menú', href: '/dashboard/menu', icon: SquareMenu },
    { label: 'Pedidos', href: '/dashboard/orders', icon: ShoppingBag },
    { label: 'Códigos QR', href: '/dashboard/qr', icon: QrCode },
    {
      label: 'Monitor KDS',
      href: restaurantId ? `/kitchen/${restaurantId}` : '/kitchen/',
      icon: MonitorPlay,
      external: true,
    },
    { label: 'WhatsApp API', href: '/dashboard/whatsapp', icon: MessageSquare },
    { label: 'Ajustes', href: '/dashboard/settings', icon: Settings },
  ];
}

/**
 * Un enlace está activo si coincide exactamente o si la ruta actual es una
 * subruta suya. /dashboard solo con coincidencia exacta (si no, siempre estaría activo).
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Título de la sección actual, para la barra superior */
export function getPageTitle(pathname: string): string {
  const match = getNavItems().find((item) => !item.external && isNavItemActive(pathname, item.href));
  return match?.label ?? 'Dashboard';
}
