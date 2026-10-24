import { createHash } from 'crypto';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PaymentsService, PAYMENT_CONFIRMED_MESSAGE } from './payments.service';
import {
  buildIntegritySignature,
  generatePaymentReference,
  mapWompiStatus,
  verifyWompiEventChecksum,
  type WompiEvent,
} from './wompi';
import { sanitizeRestaurant } from '../restaurants/sanitize-restaurant';

const EVENT_SECRET = 'test_events_secret';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** Evento firmado como lo firma Wompi */
function signedEvent(transaction: Record<string, unknown>, secret = EVENT_SECRET): WompiEvent {
  const timestamp = 1761300000;
  const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const checksum = sha(`${transaction.id}${transaction.status}${transaction.amount_in_cents}${timestamp}${secret}`).toUpperCase();
  return { event: 'transaction.updated', data: { transaction }, signature: { properties, checksum }, timestamp } as WompiEvent;
}

describe('wompi helpers', () => {
  it('firma de integridad = SHA256(referencia + centavos + moneda + secreto)', () => {
    expect(buildIntegritySignature('KOV-1', 2500000, 'COP', 'integ')).toBe(sha('KOV-12500000COPinteg'));
  });

  it('verifica el checksum del evento y rechaza eventos alterados o firmados con otro secreto', () => {
    const event = signedEvent({ id: 'tx-1', status: 'APPROVED', amount_in_cents: 2500000, reference: 'KOV-1' });
    expect(verifyWompiEventChecksum(event, EVENT_SECRET)).toBe(true);
    expect(verifyWompiEventChecksum(event, 'otro_secreto')).toBe(false);

    const tampered = structuredClone(event);
    tampered.data!.transaction!.status = 'DECLINED';
    expect(verifyWompiEventChecksum(tampered, EVENT_SECRET)).toBe(false);
    expect(verifyWompiEventChecksum({ ...event, signature: undefined }, EVENT_SECRET)).toBe(false);
  });

  it('mapea estados de Wompi y genera referencias únicas', () => {
    expect(['APPROVED', 'DECLINED', 'ERROR', 'VOIDED', 'PENDING'].map(mapWompiStatus)).toEqual([
      'PAID',
      'FAILED',
      'FAILED',
      'CANCELLED',
      null,
    ]);
    const ref = generatePaymentReference('0f8fad5b-d9cb-469f-a165-70867728950e');
    expect(ref).toMatch(/^KOV-0F8FAD5B-[0-9A-F]{8}$/);
    expect(generatePaymentReference('0f8fad5b-d9cb')).not.toBe(ref);
  });

  it('sanitizeRestaurant oculta los secretos de Wompi pero deja la llave pública', () => {
    const safe = sanitizeRestaurant({
      id: 'r1',
      wompiPublicKey: 'pub_test_x',
      wompiPrivateKey: 'prv_x',
      wompiEventSecret: 'ev',
      wompiIntegritySecret: 'in',
    });
    expect(safe).toEqual({ id: 'r1', wompiPublicKey: 'pub_test_x' });
  });
});

describe('PaymentsService', () => {
  const restaurant = {
    id: 'rest-1',
    slug: 'burger-bq',
    wompiPublicKey: 'pub_test_abc',
    wompiIntegritySecret: 'test_integrity',
    wompiEventSecret: EVENT_SECRET,
    whatsappToken: 'secreto-meta',
  };
  const orderRow = (fields: Record<string, unknown> = {}) => ({
    id: 'order-1',
    restaurantId: 'rest-1',
    total: 25000,
    paymentStatus: 'PENDING',
    paymentReference: 'KOV-ORDER1-AAAA',
    paymentMethod: null,
    customerPhone: '573001112233',
    restaurant,
    items: [],
    ...fields,
  });

  let prisma: any;
  let ordersService: any;
  let gateway: any;
  let service: PaymentsService;

  beforeEach(() => {
    prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(orderRow()),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve(orderRow(data))),
      },
    };
    ordersService = { notifyCustomer: jest.fn().mockResolvedValue(undefined) };
    gateway = { emitOrderStatusUpdated: jest.fn() };
    service = new PaymentsService(prisma, ordersService, gateway);
    process.env.FRONTEND_URL = 'https://koval.test';
  });

  it('genera el link del checkout con referencia nueva, monto en centavos y firma de integridad', async () => {
    const url = await service.generateWompiPaymentLink(
      { id: 'order-1', total: 25000, paymentReference: null, paymentStatus: 'PENDING' },
      restaurant,
    );
    const reference = prisma.order.update.mock.calls[0][0].data.paymentReference as string;
    expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: { paymentReference: reference } });

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://checkout.wompi.co/p/');
    expect(parsed.searchParams.get('public-key')).toBe('pub_test_abc');
    expect(parsed.searchParams.get('currency')).toBe('COP');
    expect(parsed.searchParams.get('amount-in-cents')).toBe('2500000');
    expect(parsed.searchParams.get('reference')).toBe(reference);
    expect(parsed.searchParams.get('signature:integrity')).toBe(sha(`${reference}2500000COPtest_integrity`));
    expect(parsed.searchParams.get('redirect-url')).toBe('https://koval.test/menu/burger-bq?pedido=order-1');
  });

  it('sin llaves de Wompi o con el pedido ya pagado no genera link', async () => {
    await expect(
      service.generateWompiPaymentLink(orderRow() as any, { ...restaurant, wompiIntegritySecret: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.generateWompiPaymentLink(orderRow({ paymentStatus: 'PAID' }) as any, restaurant)).rejects.toThrow(
      'ya está pagado',
    );
  });

  it('APPROVED con firma válida: marca PAID, guarda el método, emite al Kanban sin secretos y avisa al cliente', async () => {
    const event = signedEvent({
      id: 'tx-1',
      status: 'APPROVED',
      amount_in_cents: 2500000,
      currency: 'COP',
      reference: 'KOV-ORDER1-AAAA',
      payment_method_type: 'NEQUI',
    });

    await expect(service.handleWompiEvent(event)).resolves.toEqual({ received: true, paymentStatus: 'PAID' });

    expect(prisma.order.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { paymentReference: 'KOV-ORDER1-AAAA' } }),
    );
    expect(prisma.order.update.mock.calls[0][0].data).toEqual({ paymentStatus: 'PAID', paymentMethod: 'NEQUI' });
    const emitted = gateway.emitOrderStatusUpdated.mock.calls[0][1];
    expect(emitted.restaurant).not.toHaveProperty('wompiEventSecret');
    expect(emitted.restaurant).not.toHaveProperty('whatsappToken');
    expect(ordersService.notifyCustomer).toHaveBeenCalledWith(expect.objectContaining({ id: 'order-1' }), PAYMENT_CONFIRMED_MESSAGE);
  });

  it('firma inválida (evento falsificado): 401 y no toca el pedido', async () => {
    const forged = signedEvent(
      { id: 'tx-1', status: 'APPROVED', amount_in_cents: 2500000, currency: 'COP', reference: 'KOV-ORDER1-AAAA' },
      'secreto_adivinado',
    );
    await expect(service.handleWompiEvent(forged)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(ordersService.notifyCustomer).not.toHaveBeenCalled();
  });

  it('monto distinto al total del pedido: no se marca como pagado', async () => {
    const event = signedEvent({ id: 'tx-1', status: 'APPROVED', amount_in_cents: 100, currency: 'COP', reference: 'KOV-ORDER1-AAAA' });
    await expect(service.handleWompiEvent(event)).resolves.toEqual({ received: true, ignored: 'amount_mismatch' });
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('es idempotente: un pedido ya pagado no se vuelve a actualizar ni notificar', async () => {
    prisma.order.findUnique.mockResolvedValue(orderRow({ paymentStatus: 'PAID' }));
    const event = signedEvent({ id: 'tx-1', status: 'APPROVED', amount_in_cents: 2500000, currency: 'COP', reference: 'KOV-ORDER1-AAAA' });
    await expect(service.handleWompiEvent(event)).resolves.toMatchObject({ ignored: 'already_paid' });
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(ordersService.notifyCustomer).not.toHaveBeenCalled();
  });

  it('DECLINED marca FAILED sin avisar "pago confirmado"; referencia desconocida se ignora con 200', async () => {
    const declined = signedEvent({ id: 'tx-2', status: 'DECLINED', amount_in_cents: 2500000, currency: 'COP', reference: 'KOV-ORDER1-AAAA' });
    await expect(service.handleWompiEvent(declined)).resolves.toEqual({ received: true, paymentStatus: 'FAILED' });
    expect(ordersService.notifyCustomer).not.toHaveBeenCalled();

    prisma.order.findUnique.mockResolvedValue(null);
    await expect(service.handleWompiEvent(declined)).resolves.toEqual({ received: true, ignored: 'order_not_found' });
  });
});
