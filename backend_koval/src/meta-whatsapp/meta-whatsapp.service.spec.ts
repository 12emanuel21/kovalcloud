import { Test, TestingModule } from '@nestjs/testing';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { OrdersGateway } from '../orders/orders.gateway';

describe('MetaWhatsAppService', () => {
  let service: MetaWhatsAppService;
  let prismaService: PrismaService;
  let aiService: AiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaWhatsAppService,
        {
          provide: AiService,
          useValue: {
            parseOrderIntent: jest.fn().mockResolvedValue({
              intent: 'GREETING',
              items: [],
              responseToUser: '¡Hola! Bienvenido',
            }),
            transcribeAudio: jest.fn().mockResolvedValue('Audio transcrito'),
          },
        },
        {
          provide: OrdersGateway,
          useValue: {
            emitNewOrder: jest.fn(),
            emitOrderUpdated: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            restaurant: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'rest-1',
                name: 'Pizzería Nápoles',
                slug: 'pizzeria-napoles',
                whatsappVerifyToken: 'napoles-verify-token',
                whatsappPhoneId: '9988776655',
                whatsappToken: 'EAAB_TEST_TOKEN',
                botpressBotId: 'pizzeria-bot-custom',
              }),
            },
            menuItem: {
              findMany: jest.fn().mockResolvedValue([
                { id: 'item-1', name: 'Pizza Margherita', price: 25000, isAvailable: true, restaurantId: 'rest-1' },
              ]),
            },
            order: {
              create: jest.fn().mockResolvedValue({
                id: 'order-123',
                total: 25000,
                status: 'PENDING',
              }),
            },
            autoReply: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            chatHistory: {
              findMany: jest.fn().mockResolvedValue([]),
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({}),
              deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
          },
        },
      ],
    }).compile();

    service = module.get<MetaWhatsAppService>(MetaWhatsAppService);
    prismaService = module.get<PrismaService>(PrismaService);
    aiService = module.get<AiService>(AiService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendTextMessage', () => {
    it('should send POST request to Meta v22.0 API with restaurant credentials', async () => {
      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid.HBgL...' }] }),
      } as Response);

      const result = await service.sendTextMessage(
        '9988776655',
        'EAAB_TEST_TOKEN',
        '573001234567',
        '¡Hola! Tu pedido está en camino',
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://graph.facebook.com/v22.0/9988776655/messages',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer EAAB_TEST_TOKEN',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: '573001234567',
            type: 'text',
            text: { body: '¡Hola! Tu pedido está en camino' },
          }),
        }),
      );
      expect(result).toEqual({ messages: [{ id: 'wamid.HBgL...' }] });
    });
  });

  describe('processIncomingWebhook', () => {
    it('should resolve restaurant from DB, store chat history and pass context to AI', async () => {
      const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});
      // Simula que la consulta con orderBy desc devuelve el más reciente primero
      (prismaService.chatHistory.findMany as jest.Mock).mockResolvedValueOnce([
        { role: 'model', message: '¡Hola! Bienvenido' },
        { role: 'user', message: 'hola' },
      ]);

      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '15550234567',
                    phone_number_id: '9988776655',
                  },
                  messages: [
                    {
                      from: '573009876543',
                      id: 'wamid.123',
                      timestamp: '1700000000',
                      type: 'text',
                      text: { body: 'Quiero una pizza' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      await service.processIncomingWebhook(payload, 'napoles-verify-token');

      expect(prismaService.restaurant.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { whatsappVerifyToken: 'napoles-verify-token' },
            { slug: 'napoles-verify-token' },
            { whatsappPhoneId: '9988776655' },
          ],
        },
      });

      // Debe haber consultado el historial previo
      expect(prismaService.chatHistory.findMany).toHaveBeenCalledWith({
        where: {
          restaurantId: 'rest-1',
          customerPhone: '573009876543',
          role: { in: ['user', 'model', 'agent'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      // Debe haber guardado el mensaje de usuario
      expect(prismaService.chatHistory.create).toHaveBeenCalledWith({
        data: {
          restaurantId: 'rest-1',
          customerPhone: '573009876543',
          role: 'user',
          message: 'Quiero una pizza',
        },
      });

      // Debe haber llamado a la IA con el mensaje y el contexto de historial en orden cronológico
      expect(aiService.parseOrderIntent).toHaveBeenCalledWith(
        'Quiero una pizza',
        expect.any(String),
        [
          { role: 'user', message: 'hola' },
          { role: 'model', message: '¡Hola! Bienvenido' },
        ],
        'Pizzería Nápoles',
      );

      // Debe enviar mensaje de respuesta (por Meta: isBaileys = false)
      expect(sendSpy).toHaveBeenCalledWith(
        '9988776655',
        'EAAB_TEST_TOKEN',
        '573009876543',
        '¡Hola! Bienvenido',
        false,
      );

      // Debe haber guardado la respuesta del bot/model
      expect(prismaService.chatHistory.create).toHaveBeenCalledWith({
        data: {
          restaurantId: 'rest-1',
          customerPhone: '573009876543',
          role: 'model',
          message: '¡Hola! Bienvenido',
        },
      });
    });

    it('con el bot pausado (handover humano) registra el mensaje del cliente y no responde', async () => {
      (prismaService.chatHistory.findFirst as jest.Mock).mockImplementation(({ where }) =>
        Promise.resolve(
          where?.role === 'system' && where?.message?.in
            ? { message: '[SYSTEM_BOT_PAUSED]', createdAt: new Date() }
            : null,
        ),
      );
      const send = jest.spyOn(service, 'sendTextMessage').mockResolvedValue({});

      await service.processIncomingWebhook(
        {
          object: 'whatsapp_business_account',
          entry: [{ id: '1', changes: [{ field: 'messages', value: {
            metadata: { phone_number_id: '9988776655' },
            messages: [{ from: '573009876543', id: 'w2', timestamp: '1', type: 'text', text: { body: '¿ya salió mi pedido?' } }],
          } }] }],
        },
        'napoles-verify-token',
      );

      expect(send).not.toHaveBeenCalled();
      expect(aiService.parseOrderIntent).not.toHaveBeenCalled();
      expect(prismaService.chatHistory.create).toHaveBeenCalledWith({
        data: { restaurantId: 'rest-1', customerPhone: '573009876543', role: 'user', message: '¿ya salió mi pedido?' },
      });
    });

    it('solo envía a la IA el historial posterior al último reset', async () => {
      const resetAt = new Date('2026-10-17T10:00:00Z');
      // Solo la consulta del marcador de reset encuentra algo (no hay pausa del bot)
      (prismaService.chatHistory.findFirst as jest.Mock).mockImplementation(({ where }) =>
        Promise.resolve(where?.message === '[SYSTEM_RESET_CONTEXT]' ? { createdAt: resetAt } : null),
      );
      jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});
      (aiService.parseOrderIntent as jest.Mock).mockResolvedValueOnce({
        intent: 'GREETING',
        items: [],
        responseToUser: 'Hola de nuevo',
      });

      await service.processIncomingWebhook(
        {
          object: 'whatsapp_business_account',
          entry: [
            {
              id: '1',
              changes: [
                {
                  value: {
                    metadata: { phone_number_id: '9988776655' },
                    messages: [{ from: '573009876543', id: 'w1', timestamp: '1', type: 'text', text: { body: 'hola' } }],
                  },
                  field: 'messages',
                },
              ],
            },
          ],
        },
        'napoles-verify-token',
      );

      expect(prismaService.chatHistory.findFirst).toHaveBeenCalledWith({
        where: {
          restaurantId: 'rest-1',
          customerPhone: '573009876543',
          role: 'system',
          message: '[SYSTEM_RESET_CONTEXT]',
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      expect(prismaService.chatHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ createdAt: { gt: resetAt }, role: { in: ['user', 'model', 'agent'] } }),
        }),
      );
    });

    it('"reset" NO borra el historial: registra el intercambio y un marcador de sistema', async () => {
      const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '15550234567',
                    phone_number_id: '9988776655',
                  },
                  messages: [
                    {
                      from: '573009876543',
                      id: 'wamid.124',
                      timestamp: '1700000000',
                      type: 'text',
                      text: { body: 'reset' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      await service.processIncomingWebhook(payload, 'napoles-verify-token');

      // Auditoría: sin borrado físico, el marcador queda al final
      expect(prismaService.chatHistory.deleteMany).not.toHaveBeenCalled();
      const created = (prismaService.chatHistory.create as jest.Mock).mock.calls.map(([arg]) => arg.data);
      expect(created).toEqual([
        { restaurantId: 'rest-1', customerPhone: '573009876543', role: 'user', message: 'reset' },
        {
          restaurantId: 'rest-1',
          customerPhone: '573009876543',
          role: 'model',
          message: '🧠 Memoria borrada. Contexto limpio. ¿En qué puedo ayudarte de nuevo?',
        },
        { restaurantId: 'rest-1', customerPhone: '573009876543', role: 'system', message: '[SYSTEM_RESET_CONTEXT]' },
      ]);

      expect(sendSpy).toHaveBeenCalledWith(
        '9988776655',
        'EAAB_TEST_TOKEN',
        '573009876543',
        '🧠 Memoria borrada. Contexto limpio. ¿En qué puedo ayudarte de nuevo?',
        false,
      );

      // No debe llamar a la IA
      expect(aiService.parseOrderIntent).not.toHaveBeenCalled();
    });

    it('should abort and log warning if restaurant has no whatsappToken configured', async () => {
      jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce({
        id: 'rest-2',
        name: 'Sin Token',
        slug: 'sin-token',
        whatsappVerifyToken: 'token-2',
        whatsappPhoneId: null,
        whatsappToken: null,
        botpressBotId: 'koval-pizzeria-bot',
      } as any);

      const sendSpy = jest.spyOn(service, 'sendTextMessage');

      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  messages: [{ from: '123', id: '1', timestamp: '1', type: 'text', text: { body: 'hola' } }],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      await service.processIncomingWebhook(payload, 'token-2');
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe('horarios y cobros', () => {
    const textPayload = (body: string) => ({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123456',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '15550234567', phone_number_id: '9988776655' },
                messages: [{ from: '573009876543', id: 'wamid.200', timestamp: '1700000000', type: 'text', text: { body } }],
              },
              field: 'messages',
            },
          ],
        },
      ],
    });

    const baseRestaurant = {
      id: 'rest-1',
      name: 'Pizzería Nápoles',
      slug: 'pizzeria-napoles',
      whatsappVerifyToken: 'napoles-verify-token',
      whatsappPhoneId: '9988776655',
      whatsappToken: 'EAAB_TEST_TOKEN',
    };

    it('con cierre de emergencia responde el closedMessage y NO llama a la IA', async () => {
      jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce({
        ...baseRestaurant,
        isTemporarilyClosed: true,
        closedMessage: 'Hoy cerramos por inventario 🙏',
      } as any);
      const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

      await service.processIncomingWebhook(textPayload('Quiero una pizza'), 'napoles-verify-token');

      expect(sendSpy).toHaveBeenCalledWith('9988776655', 'EAAB_TEST_TOKEN', '573009876543', 'Hoy cerramos por inventario 🙏', false);
      expect(aiService.parseOrderIntent).not.toHaveBeenCalled();
      // El Inbox debe reflejar el mensaje del cliente y la respuesta de cierre
      const created = (prismaService.chatHistory.create as jest.Mock).mock.calls.map(([arg]) => arg.data);
      expect(created).toEqual([
        { restaurantId: 'rest-1', customerPhone: '573009876543', role: 'user', message: 'Quiero una pizza' },
        { restaurantId: 'rest-1', customerPhone: '573009876543', role: 'model', message: 'Hoy cerramos por inventario 🙏' },
      ]);
    });

    it('fuera de horario (día sin franjas) tampoco llama a la IA', async () => {
      const allClosed = { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
      jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce({
        ...baseRestaurant,
        isTemporarilyClosed: false,
        businessHours: allClosed,
      } as any);
      const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

      await service.processIncomingWebhook(textPayload('hola'), 'napoles-verify-token');

      expect(sendSpy).toHaveBeenCalledWith(
        '9988776655',
        'EAAB_TEST_TOKEN',
        '573009876543',
        expect.stringContaining('se encuentra cerrado. 🌙'),
        false,
      );
      expect(aiService.parseOrderIntent).not.toHaveBeenCalled();
    });

    it('al registrar un pedido concatena los datos de pago del local', async () => {
      jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce({
        ...baseRestaurant,
        paymentDetails: 'Nequi 300 123 4567 (Juan)',
      } as any);
      (prismaService.order as any).findFirst = jest.fn().mockResolvedValue(null);
      (aiService.parseOrderIntent as jest.Mock).mockResolvedValueOnce({
        intent: 'ORDER',
        orderType: 'TAKEAWAY',
        items: [{ productId: 'item-1', quantity: 1 }],
        customerConfirmed: true,
        readyToConfirm: true,
        customerName: 'Ana',
        responseToUser: '¡Perfecto!',
      });
      const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

      await service.processIncomingWebhook(textPayload('sí, confirmo'), 'napoles-verify-token');

      const sentText = sendSpy.mock.calls[0][3];
      expect(sentText).toContain('Pedido confirmado');
      expect(sentText).toContain('💳 *Datos de pago:*\nNequi 300 123 4567 (Juan)');
    });
  });
});
