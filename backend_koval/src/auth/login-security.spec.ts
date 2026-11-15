import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { AuthService, LOGIN_TWO_FACTOR_INVALID, LOGIN_TWO_FACTOR_REQUIRED } from './auth.service';
import { AuthController } from './auth.controller';
import { LoginThrottlerGuard } from './guards/login-throttler.guard';
import { RolesGuard } from './guards/roles.guard';
import { TenantGuard } from './guards/tenant.guard';
import { RestaurantsController } from '../restaurants/restaurants.controller';

process.env.JWT_SECRET = 'test-jwt-secret';

const SECRET = authenticator.generateSecret();
const jwt = new JwtService({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '7d' } });

describe('Login: fuerza bruta y verificación en 2 pasos', () => {
  let prisma: any;
  let service: AuthService;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('clave-correcta-123', 4);
  });

  const user = (fields: Record<string, unknown> = {}) => ({
    id: 'user-1',
    email: 'dueno@koval.test',
    name: 'Dueño',
    password: passwordHash,
    role: Role.OWNER,
    restaurantId: 'rest-1',
    isActive: true,
    isTwoFactorEnabled: false,
    twoFactorSecret: null,
    restaurant: null,
    ...fields,
  });

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    service = new AuthService(prisma, jwt);
  });

  const login = (body: Record<string, unknown>) =>
    service.login({ email: 'dueno@koval.test', password: 'clave-correcta-123', ...body } as any);

  it('sin 2FA: la contraseña basta y entrega el JWT (sin datos sensibles)', async () => {
    prisma.user.findUnique.mockResolvedValue(user());
    const result = await login({});
    expect(typeof result.accessToken).toBe('string');
    expect(result.user).not.toHaveProperty('password');
    expect(result.user).not.toHaveProperty('twoFactorSecret');
  });

  it('con 2FA y sin código: 401 TWO_FACTOR_REQUIRED, sin token', async () => {
    prisma.user.findUnique.mockResolvedValue(user({ isTwoFactorEnabled: true, twoFactorSecret: SECRET }));
    const error = await login({}).catch((e) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.getResponse()).toMatchObject({ code: LOGIN_TWO_FACTOR_REQUIRED });
  });

  it('con 2FA y código incorrecto o mal formado: 401 TWO_FACTOR_INVALID', async () => {
    prisma.user.findUnique.mockResolvedValue(user({ isTwoFactorEnabled: true, twoFactorSecret: SECRET }));
    const valid = authenticator.generate(SECRET);
    const wrong = String((Number(valid) + 500_000) % 1_000_000).padStart(6, '0');
    for (const totpCode of [wrong, 'abcdef', '12345']) {
      const error = await login({ totpCode }).catch((e) => e);
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.getResponse()).toMatchObject({ code: LOGIN_TWO_FACTOR_INVALID });
    }
  });

  it('con 2FA y código válido (con o sin espacio): entrega el JWT', async () => {
    prisma.user.findUnique.mockResolvedValue(user({ isTwoFactorEnabled: true, twoFactorSecret: SECRET }));
    const code = authenticator.generate(SECRET);
    await expect(login({ totpCode: code })).resolves.toHaveProperty('accessToken');
    await expect(login({ totpCode: `${code.slice(0, 3)} ${code.slice(3)}` })).resolves.toHaveProperty('accessToken');
  });

  it('contraseña incorrecta en una cuenta con 2FA: mismo error genérico (no revela que tiene 2FA)', async () => {
    prisma.user.findUnique.mockResolvedValue(user({ isTwoFactorEnabled: true, twoFactorSecret: SECRET }));
    const error = await login({ password: 'otra-clave' }).catch((e) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.getResponse()).not.toHaveProperty('code');
    expect(error.message).toContain('Credenciales incorrectas');
  });

  it('POST /auth/login está limitado a 5 intentos por minuto por IP', () => {
    const handler = AuthController.prototype.login;
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(LoginThrottlerGuard);
    const keys = Reflect.getMetadataKeys(handler) as string[];
    const limitKey = keys.find((k) => /LIMIT/i.test(String(k)) && /default/.test(String(k)));
    const ttlKey = keys.find((k) => /TTL/i.test(String(k)) && /default/.test(String(k)));
    expect(limitKey && Reflect.getMetadata(limitKey, handler)).toBe(5);
    expect(ttlKey && Reflect.getMetadata(ttlKey, handler)).toBe(60_000);
  });
});

describe('DELETE /restaurants/:id: borrado del tenant solo para SUPERADMIN', () => {
  const handler = RestaurantsController.prototype.remove;
  const ctx = (role: Role) =>
    ({
      getHandler: () => handler,
      getClass: () => RestaurantsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role, restaurantId: 'rest-1' }, params: { id: 'rest-1' } }) }),
    }) as any;

  it('lleva RolesGuard además de TenantGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler);
    expect(guards).toEqual(expect.arrayContaining([RolesGuard, TenantGuard]));
  });

  it('OWNER y KITCHEN de ese mismo restaurante reciben 403; SUPERADMIN pasa', () => {
    const guard = new RolesGuard(new Reflector());
    expect(() => guard.canActivate(ctx(Role.OWNER))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx(Role.KITCHEN))).toThrow(ForbiddenException);
    expect(guard.canActivate(ctx(Role.SUPERADMIN))).toBe(true);
  });
});
