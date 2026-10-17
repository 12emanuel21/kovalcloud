import {
  LayoutDashboard,
  SquareMenu,
  ShoppingBag,
  MonitorPlay,
  MessageSquare,
  MessagesSquare,
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

/** Secciones visibles para el personal de cocina (el backend además les bloquea el resto) */
const KITCHEN_NAV_HREFS = ['/dashboard/orders', '/kitchen'];

/**
 * Navegación principal del dashboard. Fuente única para Sidebar y TopBar.
 * `restaurantId` se usa para construir rutas que dependen del tenant (KDS).
 * Con `role` = KITCHEN solo quedan Pedidos y el Monitor KDS (sin Vista General ni Ajustes).
 */
export function getNavItems(restaurantId?: string, role?: string): NavItem[] {
  const items = getAllNavItems(restaurantId);
  if (role !== 'KITCHEN') return items;
  return items.filter((item) => KITCHEN_NAV_HREFS.some((href) => item.href.startsWith(href)));
}

function getAllNavItems(restaurantId?: string): NavItem[] {
  return [
    { label: 'Vista General', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Gestión de Menú', href: '/dashboard/menu', icon: SquareMenu },
    { label: 'Pedidos', href: '/dashboard/orders', icon: ShoppingBag },
    { label: 'Chats', href: '/dashboard/chats', icon: MessagesSquare },
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
