import { BadRequestException, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { TenantGuard } from './guards/tenant.guard';
import { ChatsController } from '../chats/chats.controller';
import { OrdersController } from '../orders/orders.controller';
import { OrdersService } from '../orders/orders.service';

/**
 * Aislamiento multi-tenant de los endpoints sensibles: el envío manual / handover de chats
 * y la exportación contable a Excel. El restaurante A nunca debe leer ni actuar sobre el B.
 */
const ownerA = { role: Role.OWNER, restaurantId: 'rest-A' };
const kitchenA = { role: Role.KITCHEN, restaurantId: 'rest-A' };
const superadmin = { role: Role.SUPERADMIN, restaurantId: null };

const guardsOf = (target: object) => (Reflect.getMetadata(GUARDS_METADATA, target) ?? []) as unknown[];

const contextFor = (
  controller: Function,
  handler: Function,
  user: unknown,
  request: { params?: Record<string, unknown>; query?: Record<string, unknown> } = {},
) =>
  ({
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user, params: {}, query: {}, body: {}, ...request }) }),
  }) as unknown as ExecutionContext;

describe('Aislamiento multi-tenant · chats (envío manual y pausa del bot)', () => {
  const reflector = new Reflector();
  const tenantGuard = new TenantGuard(reflector);
  const rolesGuard = new RolesGuard(reflector);
  const handlers = [
    ChatsController.prototype.sendMessage,
    ChatsController.prototype.setHandover,
    ChatsController.prototype.getStatus,
    ChatsController.prototype.getConversation,
    ChatsController.prototype.listConversations,
  ];

  it('todo el controlador exige JWT, rol y pertenencia al restaurante', () => {
    expect(guardsOf(ChatsController)).toEqual([JwtAuthGuard, RolesGuard, TenantGuard]);
  });

  it('OWNER del restaurante A recibe 403 al escribir o pausar el bot en un chat del B', () => {
    for (const handler of handlers) {
      const ctx = contextFor(ChatsController, handler, ownerA, { params: { id: 'rest-B', phone: '573001234567' } });
      expect(() => tenantGuard.canActivate(ctx)).toThrow(ForbiddenException);
    }
  });

  it('un restaurantId en query o body no sustituye al :id de la ruta', () => {
    const ctx = contextFor(ChatsController, ChatsController.prototype.sendMessage, ownerA, {
      params: { id: 'rest-B', phone: '573001234567' },
      query: { restaurantId: 'rest-A' },
    });
    expect(() => tenantGuard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('OWNER accede a su propio restaurante y SUPERADMIN a cualquiera', () => {
    const own = contextFor(ChatsController, ChatsController.prototype.sendMessage, ownerA, { params: { id: 'rest-A' } });
    const god = contextFor(ChatsController, ChatsController.prototype.sendMessage, superadmin, { params: { id: 'rest-B' } });
    expect(tenantGuard.canActivate(own)).toBe(true);
    expect(tenantGuard.canActivate(god)).toBe(true);
  });

  it('KITCHEN queda fuera aunque sea de ese mismo restaurante', () => {
    const ctx = contextFor(ChatsController, ChatsController.prototype.sendMessage, kitchenA, { params: { id: 'rest-A' } });
    expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

describe('Aislamiento multi-tenant · GET /orders/export/excel', () => {
  const build = () => {
    const prisma: any = {
      restaurant: { findUnique: jest.fn().mockResolvedValue({ name: 'Local A', slug: 'local-a' }) },
      order: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new OrdersService(prisma, {} as any, {} as any, {} as any);
    return { prisma, service };
  };

  it('exige JWT y rol OWNER/SUPERADMIN (KITCHEN recibe 403)', () => {
    expect(guardsOf(OrdersController.prototype.exportExcel)).toEqual([JwtAuthGuard, RolesGuard]);
    const ctx = contextFor(OrdersController, OrdersController.prototype.exportExcel, kitchenA);
    expect(() => new RolesGuard(new Reflector()).canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('OWNER del restaurante A recibe 403 al pedir el Excel del B, sin consultar pedidos', async () => {
    const { prisma, service } = build();
    await expect(service.exportExcel(ownerA, 'rest-B')).rejects.toThrow(ForbiddenException);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('sin ?restaurantId, el OWNER solo exporta su propio restaurante', async () => {
    const { prisma, service } = build();
    await service.exportExcel(ownerA, undefined, '2026-10-01', '2026-10-31');
    expect(prisma.restaurant.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'rest-A' } }));
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ restaurantId: 'rest-A' }) }),
    );
  });

  it('un OWNER sin restaurante asociado recibe 403', async () => {
    const { service } = build();
    await expect(service.exportExcel({ role: Role.OWNER, restaurantId: null })).rejects.toThrow(ForbiddenException);
  });

  it('SUPERADMIN debe indicar el restaurante (no hay exportación global)', async () => {
    const { prisma, service } = build();
    await expect(service.exportExcel(superadmin)).rejects.toThrow(BadRequestException);
    await service.exportExcel(superadmin, 'rest-B');
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ restaurantId: 'rest-B' }) }),
    );
  });
});
