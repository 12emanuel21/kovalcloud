import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { CreateOrderDto } from './dto/create-order.dto';

const ORDER_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const owner = { role: Role.OWNER, restaurantId: 'rest-1' };
const flush = () => new Promise((r) => setImmediate(r));
const notFound = () => new Prisma.PrismaClientKnownRequestError('Record to update not found.', { code: 'P2025', clientVersion: '5.22.0' });

/**
 * Prisma simulado con una sola fila: el UPDATE condicionado (where con dispatchedAt / paymentStatus)
 * se evalúa contra el estado actual, como en Postgres, así que dos llamadas simultáneas compiten de verdad.
 */
function buildWithRow(fields: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = {
    id: ORDER_ID,
    restaurantId: 'rest-1',
    customerName: 'Carlos Gómez',
    customerPhone: '3001234567',
    deliveryAddress: 'Cra 45 # 26-85',
    total: 45000,
    paymentStatus: 'PENDING',
    paymentMethod: 'CASH',
    orderType: 'DELIVERY',
    status: 'PREPARING',
    dispatchedAt: null,
    createdAt: new Date(),
    items: [{ quantity: 1, menuItem: { name: 'Clásica BQ' } }],
    ...fields,
  };
  const matches = (where: Record<string, any>) =>
    (!('dispatchedAt' in where) || row.dispatchedAt === where.dispatchedAt) &&
    (!where.status?.not || row.status !== where.status.not) &&
    (!where.paymentStatus?.not || row.paymentStatus !== where.paymentStatus.not);
  const prisma: any = {
    order: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve({ ...row })),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockImplementation(async ({ where, data }) => {
        await new Promise((r) => setImmediate(r));
        if (!matches(where)) throw notFound();
        Object.assign(row, data);
        return { ...row, restaurant: { name: 'Burger BQ', whatsappPhoneId: null, whatsappToken: null } };
      }),
    },
    deliveryDriver: { findFirst: jest.fn().mockResolvedValue({ id: 'drv-1', name: 'Juan', phone: '573109998877', vehicleInfo: null }) },
  };
  const gateway: any = { emitOrderStatusUpdated: jest.fn(), emitOrderUpdated: jest.fn() };
  const whatsapp: any = { sendTextMessage: jest.fn().mockResolvedValue({ success: true }) };
  const service = new OrdersService(prisma, gateway, whatsapp, {} as any, {} as any, {} as any);
  return { row, prisma, gateway, whatsapp, service };
}

describe('[P1-13] Despacho atómico', () => {
  it('dos despachos simultáneos: uno gana, el otro recibe 409 y los WhatsApp salen una sola vez', async () => {
    const { prisma, gateway, whatsapp, service } = buildWithRow();
    const results = await Promise.allSettled([
      service.dispatch(ORDER_ID, { driverId: 'drv-1' }, owner),
      service.dispatch(ORDER_ID, { driverId: 'drv-1' }, owner),
    ]);
    await flush();

    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    // La condición viaja en el mismo UPDATE
    expect(prisma.order.update.mock.calls[0][0].where).toEqual({ id: ORDER_ID, dispatchedAt: null, status: { not: 'CANCELLED' } });
    expect(gateway.emitOrderStatusUpdated).toHaveBeenCalledTimes(1);
    // Cliente + repartidor, una vez cada uno
    expect(whatsapp.sendTextMessage).toHaveBeenCalledTimes(2);
  });

  it('pedido cancelado entre la lectura y el despacho: 409 sin avisos', async () => {
    const { row, prisma, whatsapp, service } = buildWithRow();
    prisma.order.findUnique.mockImplementationOnce(() => {
      const snapshot = { ...row };
      row.status = 'CANCELLED';
      return Promise.resolve(snapshot);
    });
    await expect(service.dispatch(ORDER_ID, { driverId: 'drv-1' }, owner)).rejects.toBeInstanceOf(ConflictException);
    await flush();
    expect(whatsapp.sendTextMessage).not.toHaveBeenCalled();
  });
});

describe('[P1-13] Confirmación de pago manual atómica', () => {
  it('dos confirmaciones simultáneas: un solo "confirmamos tu pago" al cliente', async () => {
    const { row, prisma, gateway, service } = buildWithRow({ orderType: 'TAKEAWAY' });
    const notify = jest.spyOn(service, 'notifyCustomer').mockResolvedValue(undefined);
    const results = await Promise.allSettled([service.confirmManualPayment(ORDER_ID, owner), service.confirmManualPayment(ORDER_ID, owner)]);

    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    expect(prisma.order.update.mock.calls[0][0].where).toEqual({
      id: ORDER_ID,
      paymentStatus: { not: 'PAID' },
      status: { not: 'CANCELLED' },
    });
    expect(row.paymentStatus).toBe('PAID');
    expect(gateway.emitOrderUpdated).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe('[P1-12] Pedidos de la carta: autorización de datos (Ley 1581)', () => {
  const restaurant = { id: 'rest-1', name: 'Betania', isTemporarilyClosed: false, businessHours: null, branches: [] };
  const build = () => {
    const prisma: any = {
      restaurant: { findUnique: jest.fn().mockResolvedValue(restaurant) },
      menuItem: { findMany: jest.fn().mockResolvedValue([{ id: 'item-1', price: 10000 }]) },
      order: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
        fn({ order: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'o1', createdAt: new Date(), ...data, items: [] })) } }),
      ),
    };
    const zones: any = { quoteForOrder: jest.fn().mockResolvedValue(null) };
    const customers: any = { safeTouch: jest.fn().mockResolvedValue({ id: 'cust-1' }) };
    const gateway: any = { emitNewOrder: jest.fn() };
    const service = new OrdersService(prisma, gateway, {} as any, {} as any, zones, customers);
    return { prisma, customers, service };
  };
  const dto = (extra: Partial<CreateOrderDto> = {}) =>
    ({
      restaurantId: 'rest-1',
      orderType: 'TAKEAWAY',
      customerName: 'Ana',
      customerPhone: '3001234567',
      items: [{ menuItemId: 'item-1', quantity: 1 }],
      ...extra,
    }) as CreateOrderDto;

  it('sin aceptar el tratamiento de datos no se crea el pedido ni se guarda al cliente', async () => {
    const { prisma, customers, service } = build();
    for (const acceptTerms of [undefined, false]) {
      const error = await service.create(dto({ channel: 'WEB_MENU', acceptTerms })).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({ code: 'TERMS_NOT_ACCEPTED' });
    }
    await expect(service.create(dto({ channel: 'WEB', acceptTerms: false }))).rejects.toBeInstanceOf(BadRequestException);
    expect(customers.safeTouch).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('con la autorización, el pedido se crea y la aceptación queda en el cliente', async () => {
    const { customers, service } = build();
    await expect(service.create(dto({ channel: 'WEB_MENU', acceptTerms: true }))).resolves.toMatchObject({ id: 'o1', channel: 'WEB_MENU' });
    expect(customers.safeTouch).toHaveBeenCalledWith('rest-1', '573001234567', expect.objectContaining({ acceptTerms: true }));
  });

  it('el endpoint público siempre crea pedidos de la carta: no se puede saltar el consentimiento cambiando el canal', async () => {
    const ordersService = { create: jest.fn().mockResolvedValue({}) };
    const controller = new OrdersController(ordersService as any);
    await controller.create(dto({ channel: 'WHATSAPP' }));
    await controller.create(dto());
    expect(ordersService.create.mock.calls.map(([arg]: any[]) => arg.channel)).toEqual(['WEB_MENU', 'WEB_MENU']);
  });
});

describe('[P1-11] Topes del DTO público de pedidos', () => {
  const base = {
    restaurantId: 'rest-1',
    customerName: 'Ana',
    customerPhone: '3001234567',
    items: [{ menuItemId: 'item-1', quantity: 1 }],
  };
  const invalid = async (extra: Record<string, unknown>) =>
    (await validate(plainToInstance(CreateOrderDto, { ...base, ...extra }))).map((e) => e.property);

  it('acepta un pedido normal en el límite', async () => {
    await expect(
      invalid({
        customerName: 'a'.repeat(100),
        deliveryAddress: 'b'.repeat(250),
        notes: 'c'.repeat(500),
        tableNumber: 'd'.repeat(30),
        items: Array.from({ length: 50 }, (_, i) => ({ menuItemId: `item-${i}`, quantity: 1 })),
      }),
    ).resolves.toEqual([]);
  });

  it('rechaza nombre, dirección, notas, mesa e items por encima del tope', async () => {
    await expect(invalid({ customerName: 'a'.repeat(101) })).resolves.toEqual(['customerName']);
    await expect(invalid({ deliveryAddress: 'b'.repeat(251) })).resolves.toEqual(['deliveryAddress']);
    await expect(invalid({ notes: 'c'.repeat(501) })).resolves.toEqual(['notes']);
    await expect(invalid({ tableNumber: 'd'.repeat(31) })).resolves.toEqual(['tableNumber']);
    await expect(
      invalid({ items: Array.from({ length: 51 }, (_, i) => ({ menuItemId: `item-${i}`, quantity: 1 })) }),
    ).resolves.toEqual(['items']);
  });
});
