import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MenuItemsController } from './menu-items.controller';
import { MenuItemsService } from './menu-items.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MenuItemsService.toggleAvailability', () => {
  const owner = { role: Role.OWNER, restaurantId: 'r1' };
  let prisma: { menuItem: { findFirst: jest.Mock; update: jest.Mock } };
  let service: MenuItemsService;

  beforeEach(() => {
    prisma = {
      menuItem: {
        findFirst: jest.fn().mockResolvedValue({ id: 'i1', restaurantId: 'r1', isAvailable: true }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'i1', ...data })),
      },
    };
    service = new MenuItemsService(prisma as unknown as PrismaService);
  });

  it('sin body invierte el valor actual', async () => {
    await service.toggleAvailability('i1', {}, owner);
    expect(prisma.menuItem.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { isAvailable: false } });
  });

  it('con isAvailable fija el valor (idempotente) y solo toca ese campo', async () => {
    await service.toggleAvailability('i1', { isAvailable: true }, owner);
    expect(prisma.menuItem.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { isAvailable: true } });
  });

  it('rechaza platos de otro restaurante', async () => {
    await expect(service.toggleAvailability('i1', {}, { role: Role.OWNER, restaurantId: 'r2' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.menuItem.update).not.toHaveBeenCalled();
  });

  it('404 si el plato no existe o está borrado', async () => {
    prisma.menuItem.findFirst.mockResolvedValue(null);
    await expect(service.toggleAvailability('x', {}, owner)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('la cocina puede alternar platos de su restaurante, no de otro', async () => {
    await service.toggleAvailability('i1', { isAvailable: false }, { role: Role.KITCHEN, restaurantId: 'r1' });
    expect(prisma.menuItem.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { isAvailable: false } });

    prisma.menuItem.update.mockClear();
    await expect(
      service.toggleAvailability('i1', { isAvailable: false }, { role: Role.KITCHEN, restaurantId: 'r2' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.menuItem.update).not.toHaveBeenCalled();
  });

  it('JwtAuthGuard deja a la cocina usar toggle-availability pero no el PATCH completo ni el DELETE', async () => {
    const kitchen = { role: Role.KITCHEN, restaurantId: 'r1' };
    const ctx = (handler: Function) =>
      ({
        getHandler: () => handler,
        getClass: () => MenuItemsController,
        switchToHttp: () => ({ getRequest: () => ({ user: kitchen }) }),
      }) as unknown as ExecutionContext;
    jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate').mockResolvedValue(true);
    const jwt = new JwtAuthGuard(new Reflector());

    await expect(jwt.canActivate(ctx(MenuItemsController.prototype.toggleAvailability))).resolves.toBe(true);
    await expect(jwt.canActivate(ctx(MenuItemsController.prototype.update))).rejects.toThrow(ForbiddenException);
    await expect(jwt.canActivate(ctx(MenuItemsController.prototype.remove))).rejects.toThrow(ForbiddenException);
    await expect(jwt.canActivate(ctx(MenuItemsController.prototype.create))).rejects.toThrow(ForbiddenException);
  });
});
