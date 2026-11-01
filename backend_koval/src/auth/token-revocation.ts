/**
 * Un JWT emitido antes del último cambio de contraseña ya no vale (cierra las sesiones abiertas).
 * `iat` va en segundos: un token emitido en el mismo segundo del cambio se considera posterior.
 */
export function isTokenRevoked(issuedAt: number | undefined, passwordChangedAt: Date | null | undefined): boolean {
  if (!passwordChangedAt) return false;
  if (typeof issuedAt !== 'number') return true;
  return issuedAt < Math.floor(passwordChangedAt.getTime() / 1000);
}
