import { Test, TestingModule } from '@nestjs/testing';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { OrdersGateway } from '../orders/orders.gateway';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { CustomersService } from '../customers/customers.service';
import { BOT_PAUSED_MARKER } from '../chats/handover';

const RULE = 'No enviamos jugos naturales a domicilio para evitar derrames, ofrecer gaseosa en su lugar.';
const STANDARD_ACK =
  '¡Hola Ana! Recibimos tu pedido *#01*. 👨‍🍳 El equipo ya lo está preparando en cocina. Te notificaremos por aquí cuando salga con el repartidor.';

describe('Instrucciones del local en la atención por WhatsApp', () => {
  let service: MetaWhatsAppService;
  let prisma: any;
  let ai: { parseOrderIntent: jest.Mock; reviewWebOrder: jest.Mock };
  let gateway: { emitNewOrder: jest.Mock; emitOrderUpdated: jest.Mock };

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
  const WEB_MESSAGE = '¡Hola Betania! Soy Ana.\nAcabo de hacer el pedido *#01*:\n\n• 1x Jugo natural de mango — $6.000';
  const webOrder = {
    id: 'o1',
    restaurantId: 'rest-1',
    customerName: 'Ana Pérez',
    customerPhone: '573009876543',
    orderType: 'DELIVERY',
    status: 'PENDING',
    paymentMethod: 'CASH',
    paymentStatus: 'PENDING',
    notes: null,
    createdAt: new Date(),
  };

  const build = async (customInstructions: string | null) => {
    ai = { parseOrderIntent: jest.fn(), reviewWebOrder: jest.fn() };
    gateway = { emitNewOrder: jest.fn(), emitOrderUpdated: jest.fn() };
    prisma = {
      restaurant: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'rest-1',
          name: 'Betania',
          slug: 'betania',
          whatsappVerifyToken: 'tok',
          whatsappPhoneId: '9988776655',
          whatsappToken: 'EAAB',
          customInstructions,
        }),
      },
      branch: { findMany: jest.fn().mockResolvedValue([]) },
      menuItem: { findMany: jest.fn().mockResolvedValue([{ id: 'item-1', name: 'Jugo natural de mango', price: 6000, isAvailable: true }]) },
      order: {
        findFirst: jest.fn().mockResolvedValue(webOrder),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...webOrder, ...data, items: [] })),
      },
      orderItem: { findMany: jest.fn().mockResolvedValue([{ quantity: 1, menuItem: { name: 'Jugo natural de mango' } }]) },
      autoReply: { findMany: jest.fn().mockResolvedValue([]) },
      chatHistory: {
        findMany: jest.fn().mockResolvedValue([]),
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
        { provide: OrdersGateway, useValue: gateway },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(MetaWhatsAppService);
  };
  const send = async (body: string) => {
    const spy = jest.spyOn(service, 'sendTextMessage').mockResolvedValue({});
    await service.processIncomingWebhook(payload(body), 'tok');
    return spy.mock.calls[0]?.[3] as string;
  };
  const savedMessages = () => prisma.chatHistory.create.mock.calls.map(([arg]: any[]) => arg.data.message);

  describe('pedido armado en la carta web ("Acabo de hacer el pedido #01")', () => {
    it('sin instrucciones: acuse fijo de siempre, sin IA (cero tokens)', async () => {
      await build(null);
      await expect(send(WEB_MESSAGE)).resolves.toBe(STANDARD_ACK);
      expect(ai.reviewWebOrder).not.toHaveBeenCalled();
      expect(prisma.orderItem.findMany).not.toHaveBeenCalled();
    });

    it('con instrucciones y sin conflicto: revisa el pedido y responde el acuse de siempre', async () => {
      await build(RULE);
      ai.reviewWebOrder.mockResolvedValue({ hasConflict: false, reason: '', customerMessage: '' });
      await expect(send(WEB_MESSAGE)).resolves.toBe(STANDARD_ACK);
      expect(ai.reviewWebOrder).toHaveBeenCalledWith(
        { orderType: 'DELIVERY', paymentMethod: 'CASH', items: [{ name: 'Jugo natural de mango', quantity: 1 }] },
        RULE,
      );
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('con conflicto: lo advierte antes de prepararlo, alerta a la cocina y pasa el chat a una persona', async () => {
      await build(RULE);
      ai.reviewWebOrder.mockResolvedValue({
        hasConflict: true,
        reason: 'Jugo natural a domicilio',
        customerMessage: 'Los jugos naturales no los enviamos a domicilio. ¿Te lo cambiamos por una gaseosa o prefieres recogerlo en el local?',
      });
      const reply = await send(WEB_MESSAGE);
      expect(reply).toBe(
        '¡Hola Ana! Recibimos tu pedido *#01*. Antes de prepararlo, una aclaración: Los jugos naturales no los enviamos a domicilio. ' +
          '¿Te lo cambiamos por una gaseosa o prefieres recogerlo en el local?\n\nRespóndenos por aquí y una persona del equipo ajusta tu pedido.',
      );
      expect(reply).not.toContain('ya lo está preparando');
      expect(prisma.order.update.mock.calls[0][0].data).toEqual({ notes: '⚠️ Revisar con el cliente: Jugo natural a domicilio' });
      expect(gateway.emitOrderUpdated).toHaveBeenCalledWith('rest-1', expect.objectContaining({ id: 'o1', dailyNumber: 1 }));
      expect(savedMessages()).toEqual([WEB_MESSAGE, reply, BOT_PAUSED_MARKER]);
    });

    it('si la revisión falla, el pedido no se bloquea: acuse de siempre', async () => {
      await build(RULE);
      ai.reviewWebOrder.mockRejectedValue(new Error('Gemini caído'));
      await expect(send(WEB_MESSAGE)).resolves.toBe(STANDARD_ACK);
    });
  });

  describe('conversación normal', () => {
    it('la IA recibe las instrucciones del local; sin ellas se llama como siempre', async () => {
      await build(`  ${RULE} `);
      ai.parseOrderIntent.mockResolvedValue({ intent: 'GREETING', items: [], responseToUser: 'Hola' });
      await send('hola');
      expect(ai.parseOrderIntent.mock.calls[0][4]).toEqual({ customInstructions: RULE });

      await build(null);
      ai.parseOrderIntent.mockResolvedValue({ intent: 'GREETING', items: [], responseToUser: 'Hola' });
      await send('hola');
      expect(ai.parseOrderIntent.mock.calls[0]).toHaveLength(4);
    });
  });
});
