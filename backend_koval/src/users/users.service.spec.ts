import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';

const RESTAURANT_A = 'rest-a';
const RESTAURANT_B = 'rest-b';

const owner = { id: 'owner-a', role: Role.OWNER, restaurantId: RESTAURANT_A };
const superadmin = { id: 'sa', role: Role.SUPERADMIN, restaurantId: null };
const kitchen = { id: 'kitchen-a', role: Role.KITCHEN, restaurantId: RESTAURANT_A };

describe('UsersService (gestión de equipo)', () => {
  let prisma: any;
  let gateway: { disconnectUser: jest.Mock };
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
    service = new UsersService(prisma, gateway as any);
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
});
