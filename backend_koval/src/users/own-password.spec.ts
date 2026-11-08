import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { TwoFactorAuthService } from '../auth/two-factor-auth.service';
import { SUDO_SCOPE, sudoTokenSecret } from '../auth/sudo';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsersController } from './users.controller';
import { AdminController } from '../admin/admin.controller';

describe('UsersService.changeOwnPassword (PATCH /users/me/password)', () => {
  let prisma: any;
  let gateway: { disconnectUser: jest.Mock };
  let auth: { issueAccessToken: jest.Mock };
  let jwt: JwtService;
  let service: UsersService;
  let currentHash: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-jwt-secret-for-own-password-spec';
    currentHash = await bcrypt.hash('claveActual1', 4);
  });

  const account = (extra: Record<string, unknown> = {}) => ({
    id: 'owner-1',
    email: 'dueno@local.co',
    role: Role.OWNER,
    restaurantId: 'rest-1',
    password: currentHash,
    isTwoFactorEnabled: false,
    ...extra,
  });

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn().mockResolvedValue(account()), update: jest.fn().mockResolvedValue({}) } };
    gateway = { disconnectUser: jest.fn() };
    auth = { issueAccessToken: jest.fn().mockResolvedValue('nuevo-token') };
    jwt = new JwtService({});
    service = new UsersService(prisma, gateway as any, new TwoFactorAuthService(jwt), auth as any);
  });

  it('con la contraseña actual correcta: guarda el hash nuevo, cierra sesiones y devuelve un token nuevo', async () => {
    const before = Date.now();
    const result = await service.changeOwnPassword('owner-1', { currentPassword: 'claveActual1', newPassword: 'claveNueva22' });

    const { where, data } = prisma.user.update.mock.calls[0][0];
    expect(where).toEqual({ id: 'owner-1' });
    await expect(bcrypt.compare('claveNueva22', data.password)).resolves.toBe(true);
    expect(data.passwordChangedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(gateway.disconnectUser).toHaveBeenCalledWith('owner-1', expect.stringContaining('contraseña'));
    expect(auth.issueAccessToken).toHaveBeenCalledWith(expect.objectContaining({ id: 'owner-1', role: Role.OWNER }));
    expect(result).toEqual({ accessToken: 'nuevo-token' });
  });

  it('contraseña actual incorrecta: 400 (no 401) y no cambia nada', async () => {
    await expect(
      service.changeOwnPassword('owner-1', { currentPassword: 'otra', newPassword: 'claveNueva22' }),
    ).rejects.toThrow(new BadRequestException('La contraseña actual no es correcta'));
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('sin la contraseña actual y sin 2FA: la exige', async () => {
    await expect(service.changeOwnPassword('owner-1', { newPassword: 'claveNueva22' })).rejects.toThrow(
      'Ingresa tu contraseña actual',
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('sin la contraseña actual y con 2FA: exige Sudo Mode y lo acepta con un sudo token propio', async () => {
    prisma.user.findUnique.mockResolvedValue(account({ isTwoFactorEnabled: true }));
    const error = await service.changeOwnPassword('owner-1', { newPassword: 'claveNueva22' }).catch((e) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toMatchObject({ message: 'SUDO_REQUIRED' });

    const sudo = await jwt.signAsync({ sub: 'owner-1', scope: SUDO_SCOPE }, { secret: sudoTokenSecret(), expiresIn: 60 });
    await service.changeOwnPassword('owner-1', { newPassword: 'claveNueva22' }, sudo);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('rechaza reutilizar la misma contraseña', async () => {
    await expect(
      service.changeOwnPassword('owner-1', { currentPassword: 'claveActual1', newPassword: 'claveActual1' }),
    ).rejects.toThrow('La nueva contraseña debe ser distinta de la actual');
  });
});

describe('Guards de PATCH /users/me/password y /admin/restaurants/:id/owner', () => {
  it('la cocina puede cambiar su propia contraseña, pero no usar el panel SuperAdmin', async () => {
    const kitchen = { id: 'k1', role: Role.KITCHEN, restaurantId: 'rest-1' };
    const owner = { id: 'o1', role: Role.OWNER, restaurantId: 'rest-1' };
    const ctx = (cls: any, handler: Function, user: unknown) =>
      ({ getHandler: () => handler, getClass: () => cls, switchToHttp: () => ({ getRequest: () => ({ user, params: {} }) }) }) as any;
    jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate').mockResolvedValue(true);
    const reflector = new Reflector();
    const jwt = new JwtAuthGuard(reflector);
    const roles = new RolesGuard(reflector);
    const own = UsersController.prototype.changeOwnPassword;

    await expect(jwt.canActivate(ctx(UsersController, own, kitchen))).resolves.toBe(true);
    expect(roles.canActivate(ctx(UsersController, own, kitchen))).toBe(true);
    // El resto del equipo sigue cerrado para la cocina
    await expect(jwt.canActivate(ctx(UsersController, UsersController.prototype.resetPassword, kitchen))).rejects.toThrow();
    // El panel SuperAdmin: ni la cocina ni un OWNER
    const updateOwner = AdminController.prototype.updateOwner;
    expect(() => roles.canActivate(ctx(AdminController, updateOwner, owner))).toThrow();
  });
});
