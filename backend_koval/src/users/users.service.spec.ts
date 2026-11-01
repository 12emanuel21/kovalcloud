import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { TwoFactorAuthService } from '../auth/two-factor-auth.service';
import { SUDO_SCOPE, sudoTokenSecret } from '../auth/sudo';

const RESTAURANT_A = 'rest-a';
const RESTAURANT_B = 'rest-b';

const owner = { id: 'owner-a', role: Role.OWNER, restaurantId: RESTAURANT_A };
const superadmin = { id: 'sa', role: Role.SUPERADMIN, restaurantId: null };
const kitchen = { id: 'kitchen-a', role: Role.KITCHEN, restaurantId: RESTAURANT_A };

describe('UsersService (gestión de equipo)', () => {
  let prisma: any;
  let gateway: { disconnectUser: jest.Mock };
  let jwt: JwtService;
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'new', ...data })),
        update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      },
      restaurant: { findUnique: jest.fn().mockResolvedValue({ id: RESTAURANT_A }) },
    };
    gateway = { disconnectUser: jest.fn() };
    jwt = new JwtService({});
    service = new UsersService(prisma, gateway as any, new TwoFactorAuthService(jwt));
  });

  describe('listEmployees', () => {
    it('OWNER solo lista cuentas KITCHEN de su restaurante', async () => {
      await service.listEmployees(owner);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { role: Role.KITCHEN, restaurantId: RESTAURANT_A } }),
      );
    });

    it('OWNER no puede listar otro restaurante', async () => {
      await expect(service.listEmployees(owner, RESTAURANT_B)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('KITCHEN no puede listar el equipo', async () => {
      await expect(service.listEmployees(kitchen)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('createEmployee', () => {
    const dto = { name: 'Cocinero', email: 'Cocina@Local.com ', password: 'secreta123' };

    it('crea una cuenta KITCHEN en el restaurante del OWNER, con contraseña hasheada', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await service.createEmployee(owner, dto);
      const { data } = prisma.user.create.mock.calls[0][0];
      expect(data).toMatchObject({ role: Role.KITCHEN, restaurantId: RESTAURANT_A, email: 'cocina@local.com' });
      expect(data.password).not.toBe(dto.password);
    });

    it('ignora el intento del OWNER de crear en otro restaurante', async () => {
      await expect(service.createEmployee(owner, { ...dto, restaurantId: RESTAURANT_B })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rechaza correos ya registrados', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.createEmployee(owner, dto)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('updateStatus', () => {
    it('OWNER desactiva a un KITCHEN de su local y se cierran sus WebSockets', async () => {
      prisma.user.findUnique.mockResolvedValue(kitchen);
      const result = await service.updateStatus(owner, kitchen.id, false);
      expect(result.isActive).toBe(false);
      expect(gateway.disconnectUser).toHaveBeenCalledWith(kitchen.id);
    });

    it('reactivar no desconecta a nadie', async () => {
      prisma.user.findUnique.mockResolvedValue(kitchen);
      await service.updateStatus(owner, kitchen.id, true);
      expect(gateway.disconnectUser).not.toHaveBeenCalled();
    });

    it('OWNER jamás puede modificar a otro OWNER', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'owner-2', role: Role.OWNER, restaurantId: RESTAURANT_A });
      await expect(service.updateStatus(owner, 'owner-2', false)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('OWNER no ve empleados de otro restaurante (404)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'k-b', role: Role.KITCHEN, restaurantId: RESTAURANT_B });
      await expect(service.updateStatus(owner, 'k-b', false)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('nadie puede cambiar su propio acceso', async () => {
      await expect(service.updateStatus(owner, owner.id, false)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('SUPERADMIN no puede desactivar a otro SUPERADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'sa-2', role: Role.SUPERADMIN, restaurantId: null });
      await expect(service.updateStatus(superadmin, 'sa-2', false)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('KITCHEN no puede cambiar estados', async () => {
      await expect(service.updateStatus(kitchen, 'otro', false)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('resetEmployeePassword', () => {
    const kitchenB = { id: 'k-b', role: Role.KITCHEN, restaurantId: RESTAURANT_B };
    const sudoFor = (sub: string) => jwt.signAsync({ sub, scope: SUDO_SCOPE }, { secret: sudoTokenSecret(), expiresIn: 60 });
    const sudoCode = (error: any) => error?.getResponse?.();

    beforeAll(() => {
      process.env.JWT_SECRET ??= 'test-jwt-secret-for-users-spec';
    });

    it('OWNER cambia la contraseña de un KITCHEN de su local: hash bcrypt, marca de cambio y cierre de sesiones', async () => {
      prisma.user.findUnique.mockResolvedValue(kitchen);
      const before = Date.now();
      await service.resetEmployeePassword(owner, kitchen.id, 'nuevaClave123');

      const { where, data, select } = prisma.user.update.mock.calls[0][0];
      expect(where).toEqual({ id: kitchen.id });
      expect(data.password).not.toBe('nuevaClave123');
      await expect(bcrypt.compare('nuevaClave123', data.password)).resolves.toBe(true);
      expect(data.passwordChangedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(select).not.toHaveProperty('password');
      expect(gateway.disconnectUser).toHaveBeenCalledWith(kitchen.id, expect.stringContaining('contraseña'));
    });

    it('OWNER no puede tocar empleados de otro restaurante (404, sin escribir)', async () => {
      prisma.user.findUnique.mockResolvedValue(kitchenB);
      await expect(service.resetEmployeePassword(owner, kitchenB.id, 'nuevaClave123')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(gateway.disconnectUser).not.toHaveBeenCalled();
    });

    it('404 si el empleado no existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.resetEmployeePassword(owner, 'nadie', 'nuevaClave123')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('solo cuentas KITCHEN: ni otro OWNER ni un SUPERADMIN (403)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'owner-2', role: Role.OWNER, restaurantId: RESTAURANT_A });
      await expect(service.resetEmployeePassword(owner, 'owner-2', 'nuevaClave123')).rejects.toBeInstanceOf(ForbiddenException);
      prisma.user.findUnique.mockResolvedValue({ id: 'sa-2', role: Role.SUPERADMIN, restaurantId: null });
      await expect(service.resetEmployeePassword(superadmin, 'sa-2', 'nuevaClave123')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('SUPERADMIN puede cambiarla en cualquier restaurante', async () => {
      prisma.user.findUnique.mockResolvedValue(kitchenB);
      await service.resetEmployeePassword(superadmin, kitchenB.id, 'nuevaClave123');
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('KITCHEN no puede cambiar contraseñas del equipo', async () => {
      await expect(service.resetEmployeePassword(kitchen, 'otro', 'nuevaClave123')).rejects.toBeInstanceOf(ForbiddenException);
    });

    describe('gestor con 2FA activo (Sudo Mode)', () => {
      const owner2fa = { ...owner, isTwoFactorEnabled: true };

      it('sin x-sudo-token responde 403 SUDO_REQUIRED antes de consultar al empleado', async () => {
        const error = await service.resetEmployeePassword(owner2fa, kitchen.id, 'nuevaClave123').catch((e) => e);
        expect(error).toBeInstanceOf(ForbiddenException);
        expect(sudoCode(error)).toMatchObject({ message: 'SUDO_REQUIRED', reason: 'MISSING' });
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
        expect(prisma.user.update).not.toHaveBeenCalled();
      });

      it('rechaza el sudo token de otro usuario', async () => {
        const error = await service
          .resetEmployeePassword(owner2fa, kitchen.id, 'nuevaClave123', await sudoFor('otro-owner'))
          .catch((e) => e);
        expect(sudoCode(error)).toMatchObject({ message: 'SUDO_REQUIRED', reason: 'INVALID' });
      });

      it('con un sudo token vigente propio, cambia la contraseña', async () => {
        prisma.user.findUnique.mockResolvedValue(kitchen);
        await service.resetEmployeePassword(owner2fa, kitchen.id, 'nuevaClave123', await sudoFor(owner.id));
        expect(prisma.user.update).toHaveBeenCalled();
      });
    });
  });
});
