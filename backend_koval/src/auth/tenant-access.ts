import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

/** Datos mínimos del usuario autenticado necesarios para decidir acceso por tenant */
export type TenantUser = { role: Role; restaurantId: string | null };

/**
 * Lanza ForbiddenException si el usuario no puede operar sobre el restaurante indicado.
 * SUPERADMIN accede a todo; OWNER solo a su propio restaurantId.
 * Úsalo en servicios cuando el restaurante se conoce tras consultar el recurso
 * (ej. un pedido o un plato por su id), donde TenantGuard no puede decidir.
 */
export function assertTenantAccess(user: TenantUser, restaurantId: string): void {
  if (user.role === Role.SUPERADMIN) return;
  if (!user.restaurantId || user.restaurantId !== restaurantId) {
    throw new ForbiddenException('No tienes acceso a los datos de este restaurante');
  }
}

/**
 * Determina el filtro de restaurante para un listado.
 * - OWNER: siempre su propio restaurante (si pide otro -> 403).
 * - SUPERADMIN: el solicitado, o undefined (todos).
 */
export function resolveTenantFilter(user: TenantUser, requestedRestaurantId?: string): string | undefined {
  if (user.role === Role.SUPERADMIN) return requestedRestaurantId || undefined;
  if (!user.restaurantId) {
    throw new ForbiddenException('Tu usuario no está asociado a ningún restaurante');
  }
  if (requestedRestaurantId && requestedRestaurantId !== user.restaurantId) {
    throw new ForbiddenException('No tienes acceso a los datos de este restaurante');
  }
  return user.restaurantId;
}
