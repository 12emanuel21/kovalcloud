import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import type { AuthenticatedUser } from '../strategies/jwt.strategy';
import { SUDO_HEADER, SUDO_SCOPE, sudoTokenSecret, type SudoRequiredReason, type SudoTokenPayload } from '../sudo';

/** 403 que el frontend intercepta para abrir el modal de código 2FA */
export function sudoRequired(reason: SudoRequiredReason): ForbiddenException {
  return new ForbiddenException({ statusCode: 403, error: 'Forbidden', message: 'SUDO_REQUIRED', reason });
}

/**
 * Sudo Mode: exige el header x-sudo-token (JWT de 30 min emitido por POST /auth/2fa/verify-sudo)
 * del MISMO usuario autenticado y con 2FA activo. Va DESPUÉS de JwtAuthGuard:
 *   @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, SudoGuard)
 */
@Injectable()
export class SudoGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) throw new ForbiddenException('No tienes permisos para realizar esta acción');
    if (!user.isTwoFactorEnabled) throw sudoRequired('TWO_FACTOR_NOT_ENABLED');

    const header = request.headers?.[SUDO_HEADER];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token) throw sudoRequired('MISSING');

    let payload: SudoTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<SudoTokenPayload>(token, { secret: sudoTokenSecret() });
    } catch (error) {
      throw sudoRequired(error instanceof TokenExpiredError ? 'EXPIRED' : 'INVALID');
    }
    // El token de otro usuario (o sin el scope de sudo) no eleva esta sesión
    if (payload.scope !== SUDO_SCOPE || payload.sub !== user.id) throw sudoRequired('INVALID');
    return true;
  }
}
