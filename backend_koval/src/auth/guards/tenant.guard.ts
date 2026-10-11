import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { TENANT_PARAM_KEY } from '../decorators/tenant-param.decorator';
import type { AuthenticatedUser } from '../strategies/jwt.strategy';

/**
 * Aislamiento multi-tenant. Debe ir DESPUÉS de JwtAuthGuard:
 *   @UseGuards(JwtAuthGuard, TenantGuard)
 *
 * - SUPERADMIN: acceso a cualquier restaurante.
 * - OWNER: solo si el restaurante objetivo es su propio restaurantId.
 *
 * El restaurante objetivo se toma del parámetro indicado con @TenantParam(),
 * o en su defecto de `restaurantId` en params, query o body.
 * Si no se puede determinar, se deniega (fail-closed).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;

    if (!user) {
      throw new ForbiddenException('No tienes permisos para realizar esta acción');
    }

    if (user.role === Role.SUPERADMIN) {
      return true;
    }

    if (!user.restaurantId) {
      throw new ForbiddenException('Tu usuario no está asociado a ningún restaurante');
    }

    const paramName = this.reflector.getAllAndOverride<string | undefined>(TENANT_PARAM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const targetRestaurantId: unknown = paramName
      ? request.params?.[paramName]
      : request.params?.restaurantId ?? request.query?.restaurantId ?? request.body?.restaurantId;

    if (typeof targetRestaurantId !== 'string' || targetRestaurantId !== user.restaurantId) {
      throw new ForbiddenException('No tienes acceso a los datos de este restaurante');
    }

    return true;
  }
}
