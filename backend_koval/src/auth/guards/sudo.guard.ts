import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../strategies/jwt.strategy';
import { SUDO_HEADER } from '../sudo';
import { TwoFactorAuthService } from '../two-factor-auth.service';

export { sudoRequired } from '../two-factor-auth.service';

/**
 * Sudo Mode para una ruta entera (p. ej. cerrar la sesión de WhatsApp Web). Va DESPUÉS de JwtAuthGuard:
 *   @UseGuards(JwtAuthGuard, RolesGuard, SudoGuard)
 * Si solo algunos campos son sensibles, el servicio llama a TwoFactorAuthService.assertSudo.
 */
@Injectable()
export class SudoGuard implements CanActivate {
  constructor(private readonly twoFactorAuth: TwoFactorAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) throw new ForbiddenException('No tienes permisos para realizar esta acción');
    await this.twoFactorAuth.assertSudo({ user, sudoToken: request.headers?.[SUDO_HEADER] });
    return true;
  }
}
