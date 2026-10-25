import { createHmac } from 'crypto';
import { requireEnv } from '../config/secrets';

/** Duración del Sudo Mode (elevación de privilegios tras validar el código 2FA) */
export const SUDO_TOKEN_TTL_SECONDS = 30 * 60;
export const SUDO_HEADER = 'x-sudo-token';
export const SUDO_SCOPE = 'sudo';

/** Motivo de un 403 SUDO_REQUIRED (el frontend decide si pedir código o configurar el 2FA) */
export type SudoRequiredReason = 'TWO_FACTOR_NOT_ENABLED' | 'MISSING' | 'EXPIRED' | 'INVALID';

export interface SudoTokenPayload {
  sub: string;
  scope: typeof SUDO_SCOPE;
}

/**
 * Secreto propio de los sudo tokens, derivado de JWT_SECRET: un sudo token no sirve como token
 * de sesión (JwtStrategy usa JWT_SECRET) y un token de sesión no sirve como sudo token.
 */
export function sudoTokenSecret(): string {
  return createHmac('sha256', requireEnv('JWT_SECRET')).update('koval:sudo-mode:v1').digest('hex');
}
