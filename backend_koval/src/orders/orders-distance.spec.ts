import { OrdersService } from './orders.service';
import { buildDriverDispatchMessage } from './dispatch-messages';

describe('Pedidos con pin GPS (opcional: solo para el repartidor)', () => {
  const restaurant = { id: 'rest-1', name: 'Betania', isTemporarilyClosed: false, businessHours: null, extendedUntil: null, branches: [{ id: 'b-60', isMain: false }, { id: 'b-30', isMain: true }] };
  const build = () => {
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'o1', createdAt: new Date(), paymentReference: null, ...data }));
    const prisma: any = {
      restaurant: { findUnique: jest.fn().mockResolvedValue(restaurant) },
      menuItem: { findMany: jest.fn().mockResolvedValue([{ id: 'item-1', price: 20000 }]) },
      order: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn().mockImplementation((fn) => fn({ order: { create } })),
    };
    const customers: any = { safeTouch: jest.fn().mockResolvedValue({ id: 'cust-1' }) };
    const service = new OrdersService(prisma, { emitNewOrder: jest.fn() } as any, {} as any, {} as any, customers);
    return { service, create };
  };
  const dto = (extra: Record<string, unknown> = {}) =>
    ({
      restaurantId: 'rest-1',
      customerName: 'Ana',
      customerPhone: '3001112233',
      orderType: 'DELIVERY',
      items: [{ menuItemId: 'item-1', quantity: 1 }],
      customerLat: 10.99,
      customerLng: -74.81,
      ...extra,
    }) as any;

  it('con pin: guarda las coordenadas para el repartidor, pero el domicilio queda pendiente (no por distancia)', async () => {
    const { service, create } = build();
    await service.create(dto());
    expect(create.mock.calls[0][0].data).toMatchObject({
      customerLat: 10.99,
      customerLng: -74.81,
      deliveryFee: 0,
      deliveryFeePending: true,
      subtotal: 20000,
      total: 20000,
      branchId: 'b-30',
    });
    expect(create.mock.calls[0][0].data).not.toHaveProperty('deliveryDistanceKm');
  });

  it('un pin lejano ya no rechaza el pedido: el local decide el domicilio', async () => {
    const { service, create } = build();
    await expect(service.create(dto({ customerLat: 11.5, customerLng: -74.2 }))).resolves.toMatchObject({ deliveryFeePending: true });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('sin pin el pedido no lleva coordenadas ni distancia', async () => {
    const { service, create } = build();
    await service.create(dto({ customerLat: undefined, customerLng: undefined, neighborhood: 'Riomar' }));
    const data = create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('customerLat');
    expect(data).not.toHaveProperty('deliveryDistanceKm');
  });

  it('el repartidor recibe el mapa a las coordenadas exactas del pin', () => {
    const base = {
      id: 'o1',
      dailyNumber: 7,
      customerName: 'Ana',
      customerPhone: '573001112233',
      deliveryAddress: 'Ubicación compartida por WhatsApp',
      notes: null,
      total: 27000,
      paymentStatus: 'PENDING',
      items: [],
    };
    const driver = { name: 'Juan', phone: '573009998877' } as any;
    expect(buildDriverDispatchMessage({ ...base, customerLat: 10.99, customerLng: -74.81 }, driver, 'Betania')).toContain(
      'https://www.google.com/maps/search/?api=1&query=10.99,-74.81',
    );
    expect(buildDriverDispatchMessage(base, driver, 'Betania')).toContain('query=Ubicaci%C3%B3n');
  });
});
