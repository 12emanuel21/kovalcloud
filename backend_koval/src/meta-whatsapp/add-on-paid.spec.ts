import { Test, TestingModule } from '@nestjs/testing';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { OrdersGateway } from '../orders/orders.gateway';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { CustomersService } from '../customers/customers.service';
import { ADD_ON_LOCKED_MARKER, buildAddOnLockedNotice } from './order-flow';

describe('Adiciones por WhatsApp a un pedido pagado o con link de pago', () => {
  let service: MetaWhatsAppService;
  let prisma: any;
  let ai: { parseOrderIntent: jest.Mock };

  const payload = (body: string) => ({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550234567', phone_number_id: '9988776655' },
              messages: [{ from: '573009876543', id: 'wamid.1', timestamp: '1700000000', type: 'text', text: { body } }],
            },
            field: 'messages',
          },
        ],
      },
    ],
  });
  const previous = (fields: Record<string, unknown>) => ({
    id: 'o-prev',
    restaurantId: 'rest-1',
    customerPhone: '573009876543',
    status: 'PREPARING',
    total: 20000,
    notes: null,
    paymentStatus: 'PENDING',
    paymentReference: null,
    createdAt: new Date(),
    ...fields,
  });
  const addOn = (customerConfirmed: boolean) => ({
    intent: 'ORDER',
    addToPreviousOrder: true,
    orderType: 'DELIVERY',
    items: [{ productId: 'item-2', quantity: 1 }],
    customerName: 'Ana',
    deliveryAddress: 'Calle 30 # 5-10',
    paymentMethod: 'CASH',
    readyToConfirm: true,
    customerConfirmed,
    responseToUser: 'Listo.',
  });

  /** previousOrder: el pedido reciente del cliente (abierto o bloqueado según su pago) */
  const build = async (previousOrder: Record<string, unknown> | null, history: Array<{ role: string; message: string }> = []) => {
    ai = { parseOrderIntent: jest.fn() };
    const locked = previousOrder && (previousOrder.paymentStatus === 'PAID' || previousOrder.paymentReference);
    prisma = {
      restaurant: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'rest-1',
          name: 'Betania',
          slug: 'betania',
          whatsappVerifyToken: 'tok',
          whatsappPhoneId: '9988776655',
          whatsappToken: 'EAAB',
        }),
      },
      branch: { findMany: jest.fn().mockResolvedValue([]) },
      menuItem: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'item-1', name: 'Perro', price: 20000, isAvailable: true },
          { id: 'item-2', name: 'Gaseosa', price: 4000, isAvailable: true },
        ]),
      },
      order: {
        // Responde según la búsqueda: abierta (sin pago ni link), bloqueada (pagada o con link) o duplicado
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.paymentReference === null) return Promise.resolve(previousOrder && !locked ? previousOrder : null);
          if (where.OR) return Promise.resolve(locked ? previousOrder : null);
          return Promise.resolve(null);
        }),
        count: jest.fn().mockResolvedValue(2),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...previousOrder, total: 24000, ...data, items: [] })),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'o-new', createdAt: new Date(), ...data })),
      },
      autoReply: { findMany: jest.fn().mockResolvedValue([]) },
      chatHistory: {
        findMany: jest.fn().mockResolvedValue(history.map((h) => ({ ...h, createdAt: new Date() })).reverse()),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaWhatsAppService,
        { provide: AiService, useValue: ai },
        { provide: DeliveryZonesService, useValue: { quoteForOrder: jest.fn().mockResolvedValue(null) } },
        {
          provide: CustomersService,
          useValue: {
            findByPhone: jest.fn().mockResolvedValue({ id: 'cust-1', termsAcceptedAt: new Date('2026-01-01') }),
            safeTouch: jest.fn().mockResolvedValue({ id: 'cust-1' }),
          },
        },
        { provide: OrdersGateway, useValue: { emitNewOrder: jest.fn(), emitOrderUpdated: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(MetaWhatsAppService);
  };
  const send = async (aiResult: Record<string, unknown>) => {
    ai.parseOrderIntent.mockResolvedValueOnce(aiResult);
    const spy = jest.spyOn(service, 'sendTextMessage').mockResolvedValue({});
    await service.processIncomingWebhook(payload('sí, agrégala'), 'tok');
    return spy.mock.calls[0]?.[3] as string;
  };

  it('la búsqueda del pedido para sumar excluye los pagados y los que tienen link de pago', async () => {
    await build(previous({}));
    await send(addOn(true));
    const openSearch = prisma.order.findFirst.mock.calls.find(([arg]: any[]) => arg.where.paymentReference === null)[0];
    expect(openSearch.where).toMatchObject({ paymentStatus: { not: 'PAID' }, paymentReference: null });
  });

  it('pedido sin pagar y sin link: la adición se suma a ese pedido (no crea otro)', async () => {
    await build(previous({}));
    const reply = await send(addOn(true));
    expect(prisma.order.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'o-prev' },
      data: { subtotal: { increment: 4000 }, total: { increment: 4000 } },
    });
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(reply).toContain('#03');
  });

  it('pedido ya pagado: no se toca; el "sí" de la adición no registra nada y se muestra el resumen como pedido nuevo', async () => {
    await build(previous({ paymentStatus: 'PAID', paymentReference: 'KOV-1' }));
    const reply = await send(addOn(true));
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(reply).toContain(buildAddOnLockedNotice(3, true));
    expect(reply).toContain('¿Confirmas?');
  });

  it('con link de pago generado (sin pagar): también va aparte, con su aviso', async () => {
    await build(previous({ paymentReference: 'KOV-2' }));
    const reply = await send(addOn(false));
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(reply).toContain('ya tiene un link de pago generado');
  });

  it('al aceptar el resumen del pedido nuevo, se crea un pedido aparte solo con lo agregado', async () => {
    const summary = `${buildAddOnLockedNotice(3, true)}\n\n🛵 *Domicilio* ...\n\n¿Confirmas?`;
    expect(summary).toContain(ADD_ON_LOCKED_MARKER);
    await build(previous({ paymentStatus: 'PAID', paymentReference: 'KOV-1' }), [
      { role: 'user', message: 'agrégame una gaseosa' },
      { role: 'model', message: summary },
    ]);
    const reply = await send(addOn(true));
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(prisma.order.create).toHaveBeenCalledTimes(1);
    const data = prisma.order.create.mock.calls[0][0].data;
    expect(data.items.create).toEqual([{ menuItemId: 'item-2', quantity: 1, unitPrice: 4000, subtotal: 4000 }]);
    expect(data.total).toBe(4000);
    expect(reply).toContain('Pedido confirmado');
  });
});
