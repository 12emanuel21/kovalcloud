import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { KITCHEN_ACCESS_KEY } from '../decorators/kitchen-access.decorator';

/**
 * Autenticación JWT + política base de RBAC para el personal de cocina:
 * KITCHEN solo puede usar los endpoints marcados con @KitchenAccess() (denegado por defecto),
 * así cualquier endpoint nuevo queda cerrado para cocina hasta habilitarlo explícitamente.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = (await super.canActivate(context)) as boolean;
    if (!authenticated) return false;

    const { user } = context.switchToHttp().getRequest();
    if (user?.role === Role.KITCHEN) {
      const kitchenAllowed = this.reflector.getAllAndOverride<boolean>(KITCHEN_ACCESS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!kitchenAllowed) {
        throw new ForbiddenException('El personal de cocina no tiene acceso a esta sección');
      }
    }
    return true;
  }
}
