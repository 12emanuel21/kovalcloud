import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';

describe('OrdersService.create · desglose subtotal + domicilio y cliente', () => {
  const restaurant = { id: 'rest-1', name: 'Betania', isTemporarilyClosed: false, businessHours: null, extendedUntil: null };
  const build = (zones = [{ id: 'z-norte', name: 'Norte', keywords: ['riomar'], fee: 6000 }]) => {
    const create = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({ id: 'o1', createdAt: new Date(), paymentReference: null, ...data }),
    );
    const prisma: any = {
      restaurant: { findUnique: jest.fn().mockResolvedValue(restaurant) },
      menuItem: { findMany: jest.fn().mockResolvedValue([{ id: 'item-1', price: 12500 }]) },
      deliveryZone: { findMany: jest.fn().mockResolvedValue(zones) },
      order: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn().mockImplementation((fn) => fn({ order: { create } })),
    };
    const customers: any = { safeTouch: jest.fn().mockResolvedValue({ id: 'cust-1' }) };
    const service = new OrdersService(prisma, { emitNewOrder: jest.fn() } as any, {} as any, {} as any, new DeliveryZonesService(prisma), customers);
    return { service, create, customers };
  };
  const dto = (extra: Record<string, unknown> = {}) =>
    ({
      restaurantId: 'rest-1',
      customerName: 'Ana',
      customerPhone: '300 111 2233',
      deliveryAddress: 'Cra 52 # 98-10',
      items: [{ menuItemId: 'item-1', quantity: 2 }],
      ...extra,
    }) as any;

  it('domicilio en zona: subtotal + flete = total, con barrio, zona y cliente', async () => {
    const { service, create } = build();
    const order = await service.create(dto({ neighborhood: 'Riomar', orderType: 'DELIVERY' }));
    expect(create.mock.calls[0][0].data).toMatchObject({
      subtotal: 25000,
      deliveryFee: 6000,
      total: 31000,
      neighborhood: 'Riomar',
      deliveryZoneId: 'z-norte',
      customerId: 'cust-1',
      customerPhone: '573001112233',
    });
    expect(order.total).toBe(31000);
  });

  it('fuera de cobertura: no crea el pedido y sugiere recoger (OUT_OF_COVERAGE)', async () => {
    const { service, create } = build();
    const error = await service.create(dto({ neighborhood: 'Soledad' })).catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({ code: 'OUT_OF_COVERAGE', fallback: 'PICKUP' });
    expect(create).not.toHaveBeenCalled();
  });

  it('recoger o mesa: flete 0 aunque el barrio no tenga cobertura', async () => {
    const { service, create } = build();
    await service.create(dto({ orderType: 'TAKEAWAY', neighborhood: 'Soledad' }));
    await service.create(dto({ orderType: 'DINE_IN', tableNumber: '4' }));
    for (const [call] of create.mock.calls) {
      expect(call.data).toMatchObject({ subtotal: 25000, deliveryFee: 0, total: 25000, deliveryZoneId: null });
    }
  });

  it('local sin zonas: domicilio sin restricción ni flete (como antes)', async () => {
    const { service, create } = build([]);
    await service.create(dto({ neighborhood: 'Soledad' }));
    expect(create.mock.calls[0][0].data).toMatchObject({ subtotal: 25000, deliveryFee: 0, total: 25000 });
  });

  it('el checkout envía la aceptación de datos (Ley 1581): se sella en el cliente', async () => {
    const { service, customers } = build();
    await service.create(dto({ neighborhood: 'Riomar', acceptTerms: true }));
    expect(customers.safeTouch).toHaveBeenCalledWith('rest-1', '573001112233', {
      name: 'Ana',
      address: 'Cra 52 # 98-10',
      neighborhood: 'Riomar',
      acceptTerms: true,
    });
  });
});
