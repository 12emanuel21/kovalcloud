import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { isTokenRevoked } from './token-revocation';
import { JwtStrategy } from './strategies/jwt.strategy';

describe('Revocación de sesiones por cambio de contraseña', () => {
  const changedAt = new Date('2026-11-01T12:00:00.500Z');
  const changedSec = Math.floor(changedAt.getTime() / 1000);

  it('isTokenRevoked: solo los tokens emitidos antes del cambio', () => {
    expect(isTokenRevoked(changedSec - 1, changedAt)).toBe(true);
    expect(isTokenRevoked(changedSec, changedAt)).toBe(false);
    expect(isTokenRevoked(changedSec + 60, changedAt)).toBe(false);
    expect(isTokenRevoked(changedSec - 1, null)).toBe(false);
    expect(isTokenRevoked(undefined, changedAt)).toBe(true);
  });

  it('JwtStrategy rechaza el token viejo y acepta uno emitido después del cambio', async () => {
    process.env.JWT_SECRET ??= 'test-jwt-secret-for-revocation-spec';
    const user = { id: 'k1', role: Role.KITCHEN, restaurantId: 'r1', isActive: true, passwordChangedAt: changedAt, password: 'h', twoFactorSecret: null, restaurant: null };
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
    const strategy = new JwtStrategy(prisma);
    const payload = { sub: 'k1', email: 'k@x.co', role: Role.KITCHEN, restaurantId: 'r1' };

    await expect(strategy.validate({ ...payload, iat: changedSec - 3600 })).rejects.toBeInstanceOf(UnauthorizedException);
    const ok = await strategy.validate({ ...payload, iat: changedSec + 5 });
    expect(ok).not.toHaveProperty('password');
    expect(ok).not.toHaveProperty('passwordChangedAt');
  });
});
