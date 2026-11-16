/**
 * RBAC en el frontend (solo UX: la autorización real la aplica el backend).
 * - SUPERADMIN: panel global /admin. Entra al dashboard de un restaurante solo en
 *   "Modo Dios" (operando un local elegido desde /admin).
 * - OWNER: dashboard completo de su restaurante.
 * - KITCHEN: solo pedidos (Kanban) y el monitor de cocina.
 */
export type UserRole = 'SUPERADMIN' | 'OWNER' | 'KITCHEN';

/** Rutas del dashboard que puede abrir el personal de cocina */
export const KITCHEN_DASHBOARD_PATHS = ['/dashboard/orders'];

/** A dónde va cada rol tras iniciar sesión (o cuando entra a una zona que no le corresponde) */
export function homePathForRole(role: string | undefined): string {
  switch (role) {
    case 'SUPERADMIN':
      return '/admin';
    case 'KITCHEN':
      return '/dashboard/orders';
    default:
      return '/dashboard';
  }
}

/** ¿Puede este rol ver esta ruta del dashboard? (SUPERADMIN solo en Modo Dios) */
export function canAccessDashboardPath(role: string | undefined, pathname: string, isImpersonating = false): boolean {
  if (role === 'SUPERADMIN') return isImpersonating;
  if (role === 'KITCHEN') {
    return KITCHEN_DASHBOARD_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  }
  return true;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPERADMIN: 'Super Admin',
  OWNER: 'Propietario',
  KITCHEN: 'Cocina',
};

/** Zonas privadas de la app: solo aquí una sesión caducada lleva al login */
export const PROTECTED_PATH_PREFIXES = ['/dashboard', '/admin', '/kitchen'] as const;

/**
 * ¿La ruta es del panel (privada)? Se usa una lista de rutas privadas y no de públicas: la carta
 * también se abre por subdominio (pizzeria.kovalcloud.com/ se reescribe a /menu/<slug>, pero el
 * navegador sigue viendo "/"), así que cualquier ruta que no sea del panel se trata como pública.
 */
export function isProtectedAppPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
