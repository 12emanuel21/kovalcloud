import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OrdersService } from './orders.service';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';

describe('OrdersService · multisede (sede ligera)', () => {
  const restaurant = { id: 'rest-1', name: 'Betania', isTemporarilyClosed: false, businessHours: null, extendedUntil: null };
  const BRANCHES = [
    { id: 'b-30', isMain: true },
    { id: 'b-60', isMain: false },
  ];
  const ZONES = [
    { id: 'z-norte', name: 'Norte', keywords: ['riomar'], fee: 6000, branchId: 'b-60' },
    { id: 'z-centro', name: 'Centro', keywords: ['prado'], fee: 5000, branchId: null },
  ];

  const build = (branches: Array<{ id: string; isMain: boolean }> | null = BRANCHES, defaultDeliveryFee: number | null = 15000) => {
    const create = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({ id: 'o1', createdAt: new Date(), paymentReference: null, ...data }),
    );
    const prisma: any = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({ ...restaurant, defaultDeliveryFee, ...(branches ? { branches } : {}) }),
      },
      menuItem: { findMany: jest.fn().mockResolvedValue([{ id: 'item-1', price: 10000 }]) },
      deliveryZone: { findMany: jest.fn().mockResolvedValue(ZONES) },
      order: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn().mockImplementation((fn) => fn({ order: { create } })),
    };
    const gateway = { emitNewOrder: jest.fn() };
    const customers: any = { safeTouch: jest.fn().mockResolvedValue({ id: 'cust-1' }) };
    const service = new OrdersService(prisma, gateway as any, {} as any, {} as any, new DeliveryZonesService(prisma), customers);
    return { service, create, prisma, gateway };
  };
  const dto = (extra: Record<string, unknown> = {}) =>
    ({
      restaurantId: 'rest-1',
      customerName: 'Ana',
      customerPhone: '300 111 2233',
      deliveryAddress: 'Cra 52 # 98-10',
      items: [{ menuItemId: 'item-1', quantity: 1 }],
      ...extra,
    }) as any;

  it('carga solo las sedes activas junto con el restaurante', async () => {
    const { service, prisma } = build();
    await service.create(dto({ orderType: 'DELIVERY', neighborhood: 'Riomar' }));
    expect(prisma.restaurant.findUnique.mock.calls[0][0].include.branches.where).toEqual({ isActive: true });
  });

  it('DELIVERY en una zona con sede: el pedido va a esa sede y suena en su KDS', async () => {
    const { service, create, gateway } = build();
    await service.create(dto({ orderType: 'DELIVERY', neighborhood: 'Riomar' }));
    expect(create.mock.calls[0][0].data).toMatchObject({ branchId: 'b-60', deliveryZoneId: 'z-norte', deliveryFee: 6000 });
    expect(gateway.emitNewOrder.mock.calls[0][1]).toMatchObject({ branchId: 'b-60' });
  });

  it('DELIVERY con tarifa estándar (barrio sin zona) o zona sin sede: la sede principal', async () => {
    const { service, create } = build();
    await service.create(dto({ orderType: 'DELIVERY', neighborhood: 'Soledad' }));
    await service.create(dto({ orderType: 'DELIVERY', neighborhood: 'Prado' }));
    expect(create.mock.calls[0][0].data).toMatchObject({ branchId: 'b-30', deliveryFee: 15000 });
    expect(create.mock.calls[1][0].data).toMatchObject({ branchId: 'b-30', deliveryZoneId: 'z-centro' });
  });

  it('TAKEAWAY: la sede elegida por el cliente, o la principal si no eligió', async () => {
    const { service, create } = build();
    await service.create(dto({ orderType: 'TAKEAWAY', branchId: 'b-60' }));
    await service.create(dto({ orderType: 'TAKEAWAY' }));
    expect(create.mock.calls[0][0].data.branchId).toBe('b-60');
    expect(create.mock.calls[1][0].data.branchId).toBe('b-30');
  });

  it('TAKEAWAY a una sede inexistente o inactiva: 400 BRANCH_UNAVAILABLE sin crear el pedido', async () => {
    const { service, create } = build();
    const error = await service.create(dto({ orderType: 'TAKEAWAY', branchId: 'b-cerrada' })).catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({ code: 'BRANCH_UNAVAILABLE' });
    expect(create).not.toHaveBeenCalled();
  });

  it('restaurante sin sedes: el pedido no lleva branchId (igual que siempre)', async () => {
    // [] = sin sedes; null = respuesta sin el campo branches
    for (const branches of [[], null]) {
      const { service, create } = build(branches);
      await service.create(dto({ orderType: 'DELIVERY', neighborhood: 'Riomar' }));
      await service.create(dto({ orderType: 'TAKEAWAY' }));
      for (const [call] of create.mock.calls) expect(call.data).not.toHaveProperty('branchId');
    }
  });

  describe('tablero (GET /orders)', () => {
    const listWith = () => {
      const prisma: any = { order: { findMany: jest.fn().mockResolvedValue([]) } };
      return { prisma, service: new OrdersService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any) };
    };

    it('la cocina de una sede solo ve los pedidos de su sede', async () => {
      const { prisma, service } = listWith();
      await service.findAll({ role: Role.KITCHEN, restaurantId: 'rest-1', branchId: 'b-60' }, undefined, 'all');
      expect(prisma.order.findMany.mock.calls[0][0].where).toEqual({ restaurantId: 'rest-1', branchId: 'b-60' });
    });

    it('el dueño y la cocina sin sede ven todos los pedidos del local', async () => {
      const { prisma, service } = listWith();
      await service.findAll({ role: Role.OWNER, restaurantId: 'rest-1', branchId: 'b-60' }, undefined, 'all');
      await service.findAll({ role: Role.KITCHEN, restaurantId: 'rest-1', branchId: null }, undefined, 'all');
      expect(prisma.order.findMany.mock.calls[0][0].where).toEqual({ restaurantId: 'rest-1' });
      expect(prisma.order.findMany.mock.calls[1][0].where).toEqual({ restaurantId: 'rest-1' });
    });
  });
});
