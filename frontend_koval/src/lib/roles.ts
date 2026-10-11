/**
 * RBAC en el frontend (solo UX: la autorización real la aplica el backend).
 * - SUPERADMIN: panel global /admin (no entra al dashboard de un restaurante).
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

/** ¿Puede este rol ver esta ruta del dashboard? */
export function canAccessDashboardPath(role: string | undefined, pathname: string): boolean {
  if (role === 'SUPERADMIN') return false;
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
