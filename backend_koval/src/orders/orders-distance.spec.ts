import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { buildDriverDispatchMessage } from './dispatch-messages';

describe('Pedidos con pin GPS (domicilio por distancia)', () => {
  const restaurant = { id: 'rest-1', name: 'Betania', isTemporarilyClosed: false, businessHours: null, extendedUntil: null, branches: [{ id: 'b-60', isMain: false }, { id: 'b-30', isMain: true }] };
  const build = (quote: unknown) => {
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'o1', createdAt: new Date(), paymentReference: null, ...data }));
    const prisma: any = {
      restaurant: { findUnique: jest.fn().mockResolvedValue(restaurant) },
      menuItem: { findMany: jest.fn().mockResolvedValue([{ id: 'item-1', price: 20000 }]) },
      order: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn().mockImplementation((fn) => fn({ order: { create } })),
    };
    const zones: any = { quoteForOrder: jest.fn().mockResolvedValue(quote) };
    const customers: any = { safeTouch: jest.fn().mockResolvedValue({ id: 'cust-1' }) };
    const service = new OrdersService(prisma, { emitNewOrder: jest.fn() } as any, {} as any, {} as any, zones, customers);
    return { service, create, zones };
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

  it('cotiza con el pin y guarda coordenadas, distancia, envío y la sede más cercana', async () => {
    const quote = { isCovered: true, distanceKm: 3.1, deliveryFee: 7000, zoneId: null, zoneName: '3,1 km', coverageConfigured: true, branchId: 'b-60' };
    const { service, create, zones } = build(quote);
    await service.create(dto());
    expect(zones.quoteForOrder).toHaveBeenCalledWith('rest-1', 'DELIVERY', undefined, undefined, { lat: 10.99, lng: -74.81 });
    expect(create.mock.calls[0][0].data).toMatchObject({
      customerLat: 10.99,
      customerLng: -74.81,
      deliveryDistanceKm: 3.1,
      deliveryFee: 7000,
      subtotal: 20000,
      total: 27000,
      branchId: 'b-60',
    });
  });

  it('fuera del radio: OUT_OF_COVERAGE con la distancia y el radio, sin crear el pedido', async () => {
    const { service, create } = build({ isCovered: false, distanceKm: 9.4, maxRadius: 8, fallback: 'TAKEAWAY', deliveryFee: 0, coverageConfigured: true });
    const error = await service.create(dto()).catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({ code: 'OUT_OF_COVERAGE', distanceKm: 9.4, maxRadius: 8, fallback: 'TAKEAWAY' });
    expect(error.getResponse().message).toContain('9,4 km');
    expect(create).not.toHaveBeenCalled();
  });

  it('sin pin el pedido no lleva coordenadas ni distancia', async () => {
    const { service, create } = build({ isCovered: true, zoneId: 'z1', zoneName: 'Norte', deliveryFee: 6000, coverageConfigured: true });
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
