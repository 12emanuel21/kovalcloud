import { Injectable } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';

/** Límite de intentos de código 2FA por IP (evita adivinar los 6 dígitos por fuerza bruta) */
@Injectable()
export class TwoFactorThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(): Promise<void> {
    throw new ThrottlerException('Demasiados intentos de código. Espera un minuto e intenta de nuevo.');
  }
}
