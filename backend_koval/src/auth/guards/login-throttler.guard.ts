import { Injectable } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';

/**
 * Límite de intentos de inicio de sesión por IP: frena la fuerza bruta de contraseñas (y del
 * código 2FA del login). El mensaje global del throttler habla de pedidos; aquí, de la sesión.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(): Promise<void> {
    throw new ThrottlerException('Demasiados intentos de inicio de sesión. Espera un minuto e intenta de nuevo.');
  }
}
