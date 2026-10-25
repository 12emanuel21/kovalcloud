import { ForbiddenException, Injectable } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import type { AuthenticatedUser } from './strategies/jwt.strategy';
import { SUDO_SCOPE, sudoTokenSecret, type SudoRequiredReason, type SudoTokenPayload } from './sudo';

/** 403 que el frontend intercepta para abrir el modal de código 2FA */
export function sudoRequired(reason: SudoRequiredReason): ForbiddenException {
  return new ForbiddenException({ statusCode: 403, error: 'Forbidden', message: 'SUDO_REQUIRED', reason });
}

/** Quién pide un cambio sensible y el x-sudo-token que envió (si envió uno) */
export interface SudoCredentials {
  user: AuthenticatedUser;
  sudoToken?: string | string[];
}

@Injectable()
export class TwoFactorAuthService {
  constructor(private readonly jwtService: JwtService) {}

  /**
   * Sudo Mode: exige un sudo token vigente (POST /auth/2fa/verify-sudo, 30 min) del MISMO
   * usuario autenticado y con 2FA activo. Si no, lanza 403 SUDO_REQUIRED con el motivo.
   * Lo usan SudoGuard (rutas enteras) y los servicios que solo protegen algunos campos.
   */
  async assertSudo({ user, sudoToken }: SudoCredentials): Promise<void> {
    if (!user.isTwoFactorEnabled) throw sudoRequired('TWO_FACTOR_NOT_ENABLED');

    const token = Array.isArray(sudoToken) ? sudoToken[0] : sudoToken;
    if (!token) throw sudoRequired('MISSING');

    let payload: SudoTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<SudoTokenPayload>(token, { secret: sudoTokenSecret() });
    } catch (error) {
      throw sudoRequired(error instanceof TokenExpiredError ? 'EXPIRED' : 'INVALID');
    }
    // El token de otro usuario (o sin el scope de sudo) no eleva esta sesión
    if (payload.scope !== SUDO_SCOPE || payload.sub !== user.id) throw sudoRequired('INVALID');
  }
}
