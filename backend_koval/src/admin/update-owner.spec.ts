import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AdminService } from './admin.service';
import { TwoFactorAuthService } from '../auth/two-factor-auth.service';

describe('AdminService.updateOwner (PATCH /admin/restaurants/:id/owner)', () => {
  let prisma: any;
  let gateway: { disconnectUser: jest.Mock };
  let service: AdminService;
  const superadmin = { user: { id: 'sa-1', isTwoFactorEnabled: false } };

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'owner-1' }),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'owner-1', role: Role.OWNER, ...data })),
      },
    };
    gateway = { disconnectUser: jest.fn() };
    service = new AdminService(prisma, gateway as any, new TwoFactorAuthService(new JwtService({})));
  });

  it('actualiza nombre y email del dueño más antiguo del restaurante, sin tocar la contraseña ni las sesiones', async () => {
    await service.updateOwner('rest-1', { name: 'Ana Pérez', email: 'ana@local.co' }, superadmin);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { restaurantId: 'rest-1', role: Role.OWNER },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const { data, select } = prisma.user.update.mock.calls[0][0];
    expect(data).toEqual({ name: 'Ana Pérez', email: 'ana@local.co' });
    expect(select).not.toHaveProperty('password');
    expect(gateway.disconnectUser).not.toHaveBeenCalled();
  });

  it('forzar contraseña: la guarda con bcrypt, marca el cambio y cierra sus sesiones', async () => {
    await service.updateOwner('rest-1', { password: 'temporal123' }, superadmin);
    const { data } = prisma.user.update.mock.calls[0][0];
    await expect(bcrypt.compare('temporal123', data.password)).resolves.toBe(true);
    expect(data.passwordChangedAt).toBeInstanceOf(Date);
    expect(gateway.disconnectUser).toHaveBeenCalledWith('owner-1', expect.any(String));
  });

  it('sin cambios: 400; restaurante sin dueño: 404', async () => {
    await expect(service.updateOwner('rest-1', {}, superadmin)).rejects.toBeInstanceOf(BadRequestException);
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.updateOwner('rest-1', { name: 'X' }, superadmin)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('email ya registrado por otro usuario: 409', async () => {
    prisma.user.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x', meta: { target: ['email'] } }));
    await expect(service.updateOwner('rest-1', { email: 'otro@local.co' }, superadmin)).rejects.toBeInstanceOf(ConflictException);
  });

  it('SUPERADMIN con 2FA sin sudo token: 403 SUDO_REQUIRED antes de tocar nada', async () => {
    const error = await service
      .updateOwner('rest-1', { password: 'temporal123' }, { user: { id: 'sa-1', isTwoFactorEnabled: true } })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
