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
      );

      // Debe enviar mensaje de respuesta
      expect(sendSpy).toHaveBeenCalledWith(
        '9988776655',
        'EAAB_TEST_TOKEN',
        '573009876543',
        '¡Hola! Bienvenido',
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

    it('should delete chat history on "reset" command and reply with confirmation', async () => {
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

      // Debe haber borrado el historial del usuario
      expect(prismaService.chatHistory.deleteMany).toHaveBeenCalledWith({
        where: {
          restaurantId: 'rest-1',
          customerPhone: '573009876543',
        },
      });

      expect(sendSpy).toHaveBeenCalledWith(
        '9988776655',
        'EAAB_TEST_TOKEN',
        '573009876543',
        '🧠 Memoria borrada. Contexto limpio. ¿En qué puedo ayudarte de nuevo?',
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
});
