import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../strategies/jwt.strategy';

/** Inyecta el usuario autenticado (req.user). Requiere JwtAuthGuard en la ruta. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => ctx.switchToHttp().getRequest().user,
);
