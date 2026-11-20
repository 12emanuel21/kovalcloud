import { OrdersService } from './orders.service';
import { DELIVERY_FEE_PENDING_NOTE } from './delivery-fee';

describe('OrdersService.create · domicilio manual (botones del Kanban) y cliente', () => {
  const restaurant = { id: 'rest-1', name: 'Betania', isTemporarilyClosed: false, businessHours: null, extendedUntil: null };
  const build = (flatDeliveryFee: number | null = null) => {
    const create = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({ id: 'o1', createdAt: new Date(), paymentReference: null, ...data }),
    );
    const prisma: any = {
      restaurant: { findUnique: jest.fn().mockResolvedValue({ ...restaurant, flatDeliveryFee }) },
      menuItem: { findMany: jest.fn().mockResolvedValue([{ id: 'item-1', price: 12500 }]) },
      // Ya no se consultan zonas: el valor lo define el local
      deliveryZone: { findMany: jest.fn() },
      order: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn().mockImplementation((fn) => fn({ order: { create } })),
    };
    const customers: any = { safeTouch: jest.fn().mockResolvedValue({ id: 'cust-1' }) };
    const service = new OrdersService(prisma, { emitNewOrder: jest.fn() } as any, {} as any, {} as any, customers);
    return { service, create, customers, prisma };
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

  it('domicilio sin tarifa fija: nace en $0 y pendiente; la respuesta trae la nota "por confirmar"', async () => {
    const { service, create, prisma } = build();
    const order = await service.create(dto({ neighborhood: 'Riomar', orderType: 'DELIVERY' }));
    expect(create.mock.calls[0][0].data).toMatchObject({
      subtotal: 25000,
      deliveryFee: 0,
      deliveryFeePending: true,
      total: 25000,
      neighborhood: 'Riomar',
      customerId: 'cust-1',
      customerPhone: '573001112233',
    });
    expect(create.mock.calls[0][0].data).not.toHaveProperty('deliveryZoneId');
    expect(order).toMatchObject({ total: 25000, deliveryFeePending: true, deliveryFeeNote: DELIVERY_FEE_PENDING_NOTE });
    expect(DELIVERY_FEE_PENDING_NOTE).toBe('🛵 Domicilio: por confirmar según dirección y clima');
    expect(prisma.deliveryZone.findMany).not.toHaveBeenCalled();
  });

  it('un barrio que antes no tenía cobertura ya no se rechaza: el local define el domicilio', async () => {
    const { service, create } = build();
    await expect(service.create(dto({ neighborhood: 'Soledad' }))).resolves.toMatchObject({ deliveryFeePending: true });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('con tarifa fija única: se cobra sola y no queda pendiente', async () => {
    const { service, create } = build(5000);
    const order = await service.create(dto({ neighborhood: 'Riomar' }));
    expect(create.mock.calls[0][0].data).toMatchObject({ subtotal: 25000, deliveryFee: 5000, deliveryFeePending: false, total: 30000 });
    expect(order).not.toHaveProperty('deliveryFeeNote');
  });

  it('tarifa fija de $0: domicilio siempre gratis (no pendiente)', async () => {
    const { service, create } = build(0);
    await service.create(dto());
    expect(create.mock.calls[0][0].data).toMatchObject({ deliveryFee: 0, deliveryFeePending: false, total: 25000 });
  });

  it('recoger o mesa: sin domicilio ni pendiente', async () => {
    const { service, create } = build(5000);
    await service.create(dto({ orderType: 'TAKEAWAY', neighborhood: 'Soledad' }));
    await service.create(dto({ orderType: 'DINE_IN', tableNumber: '4' }));
    for (const [call] of create.mock.calls) {
      expect(call.data).toMatchObject({ subtotal: 25000, deliveryFee: 0, deliveryFeePending: false, total: 25000 });
    }
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
