import { createHash } from 'crypto';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaymentsService, PAYMENT_CONFIRMED_MESSAGE } from './payments.service';
import { WompiCheckoutService } from './wompi-checkout.service';
import { basePaymentReference, isWompiTestKey, nextPaymentReference, wompiApiBaseUrl, type WompiEvent } from './wompi';
import { RestaurantsService } from '../restaurants/restaurants.service';
import type { AiService } from '../ai/ai.service';

const EVENT_SECRET = 'eventos_prod';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function signedEvent(transaction: Record<string, unknown>): WompiEvent {
  const timestamp = 1761300000;
  const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const checksum = sha(`${transaction.id}${transaction.status}${transaction.amount_in_cents}${timestamp}${EVENT_SECRET}`);
  return { event: 'transaction.updated', data: { transaction }, signature: { properties, checksum }, timestamp } as WompiEvent;
}

const notFound = () => new Prisma.PrismaClientKnownRequestError('Record to update not found.', { code: 'P2025', clientVersion: '5.22.0' });

describe('[P1-3] Llaves de prueba de Wompi en producción', () => {
  const ALL_TEST_KEYS = {
    wompiPublicKey: 'pub_test_abc',
    wompiPrivateKey: 'prv_test_abc',
    wompiEventSecret: 'test_events_abc',
    wompiIntegritySecret: 'test_integrity_abc',
  };
  const build = (stored: Record<string, unknown>) => {
    const prisma: any = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue(stored),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'rest-1', ...stored, ...data })),
      },
    };
    const twoFactorAuth = { assertSudo: jest.fn().mockResolvedValue(undefined) };
    return { prisma, service: new RestaurantsService(prisma, {} as AiService, twoFactorAuth as any) };
  };
  const sudo = { password: 'x' } as any;
  const env = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = env;
  });

  it('identifica llaves del sandbox y apunta la API al ambiente de la llave', () => {
    expect(['pub_test_x', ' prv_test_x', 'pub_prod_x', 'prv_prod_x', null].map(isWompiTestKey)).toEqual([true, true, false, false, false]);
    expect(wompiApiBaseUrl('prv_test_x')).toBe('https://sandbox.wompi.co/v1');
    expect(wompiApiBaseUrl('prv_prod_x')).toBe('https://production.wompi.co/v1');
  });

  it('en producción rechaza encender los cobros con pub_test_ o prv_test_', async () => {
    process.env.NODE_ENV = 'production';
    const { prisma, service } = build({ isWompiEnabled: false, ...ALL_TEST_KEYS });
    await expect(service.updateConfig('rest-1', { isWompiEnabled: true }, sudo)).rejects.toThrow(/llaves de prueba/);

    // Solo la privada de prueba también se rechaza
    const mixed = build({ isWompiEnabled: false, ...ALL_TEST_KEYS, wompiPublicKey: 'pub_prod_abc' });
    await expect(mixed.service.updateConfig('rest-1', { isWompiEnabled: true }, sudo)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.restaurant.update).not.toHaveBeenCalled();
  });

  it('en producción las llaves de prueba se pueden guardar, pero no encienden solas los cobros', async () => {
    process.env.NODE_ENV = 'production';
    const { prisma, service } = build({ isWompiEnabled: false, wompiPublicKey: null, wompiPrivateKey: null, wompiEventSecret: null, wompiIntegritySecret: null });
    const result = await service.updateConfig('rest-1', ALL_TEST_KEYS, sudo);
    expect(prisma.restaurant.update.mock.calls[0][0].data.isWompiEnabled).toBeUndefined();
    expect(result.onlinePaymentsEnabled).toBe(false);
  });

  it('con llaves de producción se encienden, y fuera de producción las de prueba siguen sirviendo', async () => {
    process.env.NODE_ENV = 'production';
    const prod = build({ isWompiEnabled: false, wompiPublicKey: 'pub_prod_abc', wompiPrivateKey: 'prv_prod_abc', wompiEventSecret: 'e', wompiIntegritySecret: 'i' });
    await expect(prod.service.updateConfig('rest-1', { isWompiEnabled: true }, sudo)).resolves.toMatchObject({ isWompiEnabled: true });

    process.env.NODE_ENV = 'development';
    const dev = build({ isWompiEnabled: false, ...ALL_TEST_KEYS });
    await expect(dev.service.updateConfig('rest-1', { isWompiEnabled: true }, sudo)).resolves.toMatchObject({ isWompiEnabled: true });
  });
});

describe('[P1-1] Reintento de pago tras un rechazo', () => {
  const restaurant = { slug: 'betania', wompiPublicKey: 'pub_prod_abc', wompiIntegritySecret: 'integ', wompiEventSecret: EVENT_SECRET };

  it('referencias de reintento: -r2, -r3... conservando la base', () => {
    expect(nextPaymentReference('KOV-0F8FAD5B-1A2B3C4D')).toBe('KOV-0F8FAD5B-1A2B3C4D-r2');
    expect(nextPaymentReference('KOV-0F8FAD5B-1A2B3C4D-r2')).toBe('KOV-0F8FAD5B-1A2B3C4D-r3');
    expect(nextPaymentReference('KOV-0F8FAD5B-1A2B3C4D-r9')).toBe('KOV-0F8FAD5B-1A2B3C4D-r10');
    expect(basePaymentReference('KOV-0F8FAD5B-1A2B3C4D-r3')).toBe('KOV-0F8FAD5B-1A2B3C4D');
  });

  it('pago rechazado: el link nuevo lleva otra referencia y el pedido vuelve a pendiente', async () => {
    const prisma: any = { order: { update: jest.fn().mockResolvedValue({}) } };
    const checkout = new WompiCheckoutService(prisma);
    const { url, reference } = await checkout.generatePaymentLink(
      { id: 'o1', total: 25000, paymentReference: 'KOV-O1-AAAA', paymentStatus: 'FAILED' },
      restaurant,
    );
    expect(reference).toBe('KOV-O1-AAAA-r2');
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { paymentReference: 'KOV-O1-AAAA-r2', paymentStatus: 'PENDING' },
    });
    expect(new URL(url).searchParams.get('reference')).toBe('KOV-O1-AAAA-r2');
    expect(new URL(url).searchParams.get('signature:integrity')).toBe(sha('KOV-O1-AAAA-r22500000COPinteg'));
  });

  it('link pendiente (sin rechazo): se reutiliza la misma referencia', async () => {
    const prisma: any = { order: { update: jest.fn() } };
    const { reference } = await new WompiCheckoutService(prisma).generatePaymentLink(
      { id: 'o1', total: 25000, paymentReference: 'KOV-O1-AAAA', paymentStatus: 'PENDING' },
      restaurant,
    );
    expect(reference).toBe('KOV-O1-AAAA');
    expect(prisma.order.update).not.toHaveBeenCalled();
  });
});

describe('[P1-2] Webhook de Wompi: verificación con la API e idempotencia', () => {
  const REFERENCE = 'KOV-ORDER1-AAAA';
  const restaurant = {
    id: 'rest-1',
    slug: 'betania',
    wompiPublicKey: 'pub_prod_abc',
    wompiPrivateKey: 'prv_prod_secreta',
    wompiIntegritySecret: 'integ',
    wompiEventSecret: EVENT_SECRET,
  };
  const approved = { id: 'tx-77', status: 'APPROVED', amount_in_cents: 2500000, currency: 'COP', reference: REFERENCE, payment_method_type: 'NEQUI' };

  let fetchMock: jest.SpyInstance;
  afterEach(() => fetchMock?.mockRestore());
  const mockWompiApi = (impl: () => Promise<unknown>) => {
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(impl as any);
  };
  const apiResponse = (data: Record<string, unknown>, status = 200) =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve({ data }) });

  /** Simula la fila en Postgres: el UPDATE condicionado solo cambia un pedido aún no pagado */
  const build = (keys: Record<string, unknown> = {}) => {
    const row: Record<string, unknown> = {
      id: 'order-1',
      restaurantId: 'rest-1',
      total: 25000,
      paymentStatus: 'PENDING',
      paymentReference: REFERENCE,
      paymentMethod: 'WOMPI',
      customerPhone: '573001112233',
      items: [],
    };
    const prisma: any = {
      order: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve({ ...row, restaurant: { ...restaurant, ...keys } })),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          await new Promise((r) => setImmediate(r));
          if (where.paymentStatus?.not === row.paymentStatus) throw notFound();
          Object.assign(row, data);
          return { ...row, restaurant: { ...restaurant, ...keys } };
        }),
      },
    };
    const ordersService = { notifyCustomer: jest.fn().mockResolvedValue(undefined) };
    const gateway = { emitOrderStatusUpdated: jest.fn() };
    const service = new PaymentsService(prisma, ordersService as any, gateway as any, new WompiCheckoutService(prisma));
    return { row, prisma, ordersService, gateway, service };
  };

  it('APPROVED confirmado por la API: marca PAID con el id de la transacción (consulta producción con la llave privada)', async () => {
    mockWompiApi(() => apiResponse(approved));
    const { row, service, ordersService } = build();
    await expect(service.handleWompiEvent(signedEvent(approved))).resolves.toEqual({ received: true, paymentStatus: 'PAID' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://production.wompi.co/v1/transactions/tx-77',
      expect.objectContaining({ headers: { Authorization: 'Bearer prv_prod_secreta' } }),
    );
    expect(row).toMatchObject({ paymentStatus: 'PAID', paymentMethod: 'NEQUI', wompiTransactionId: 'tx-77' });
    expect(ordersService.notifyCustomer).toHaveBeenCalledWith(expect.objectContaining({ id: 'order-1' }), PAYMENT_CONFIRMED_MESSAGE);
  });

  it.each([
    ['la API dice DECLINED', { status: 'DECLINED' }],
    ['otro monto en la API', { amount_in_cents: 100 }],
    ['otra referencia en la API', { reference: 'KOV-OTRO-BBBB' }],
  ])('evento firmado pero %s: no se marca pagado', async (_label, override) => {
    mockWompiApi(() => apiResponse({ ...approved, ...override }));
    const { row, prisma, ordersService, service } = build();
    await expect(service.handleWompiEvent(signedEvent(approved))).resolves.toEqual({ received: true, ignored: 'transaction_not_verified' });
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(row.paymentStatus).toBe('PENDING');
    expect(ordersService.notifyCustomer).not.toHaveBeenCalled();
  });

  it('transacción inexistente en Wompi (404): no se marca pagado', async () => {
    mockWompiApi(() => apiResponse({}, 404));
    const { prisma, service } = build();
    await expect(service.handleWompiEvent(signedEvent(approved))).resolves.toMatchObject({ ignored: 'transaction_not_verified' });
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('Wompi no responde: 503 para que reintente el webhook, sin tocar el pedido', async () => {
    mockWompiApi(() => Promise.reject(new Error('ECONNRESET')));
    const { prisma, service } = build();
    await expect(service.handleWompiEvent(signedEvent(approved))).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('llave privada de prueba: verifica contra el sandbox', async () => {
    mockWompiApi(() => apiResponse(approved));
    const { service } = build({ wompiPrivateKey: 'prv_test_abc' });
    await service.handleWompiEvent(signedEvent(approved));
    expect(fetchMock.mock.calls[0][0]).toBe('https://sandbox.wompi.co/v1/transactions/tx-77');
  });

  it('dos webhooks APPROVED simultáneos: un solo PAID, un solo aviso al Kanban y al cliente', async () => {
    mockWompiApi(() => apiResponse(approved));
    const { row, prisma, gateway, ordersService, service } = build();
    const results = await Promise.all([service.handleWompiEvent(signedEvent(approved)), service.handleWompiEvent(signedEvent(approved))]);

    expect(results).toEqual(
      expect.arrayContaining([
        { received: true, paymentStatus: 'PAID' },
        { received: true, ignored: 'already_paid', paymentStatus: 'PAID' },
      ]),
    );
    expect(prisma.order.update).toHaveBeenCalledTimes(2);
    expect(prisma.order.update.mock.calls[0][0].where).toEqual({ id: 'order-1', paymentStatus: { not: 'PAID' } });
    expect(row.paymentStatus).toBe('PAID');
    expect(gateway.emitOrderStatusUpdated).toHaveBeenCalledTimes(1);
    expect(ordersService.notifyCustomer).toHaveBeenCalledTimes(1);
  });

  it('un DECLINED tardío no deshace un pago ya confirmado', async () => {
    const { row, service, gateway } = build({ wompiPrivateKey: null });
    row.paymentStatus = 'PAID';
    const declined = { ...approved, id: 'tx-80', status: 'DECLINED' };
    // findUnique ve PAID: se ignora antes del UPDATE
    await expect(service.handleWompiEvent(signedEvent(declined))).resolves.toMatchObject({ ignored: 'already_paid' });
    expect(row.paymentStatus).toBe('PAID');
    expect(gateway.emitOrderStatusUpdated).not.toHaveBeenCalled();
  });
});
