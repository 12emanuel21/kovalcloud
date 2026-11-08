import { Test, TestingModule } from '@nestjs/testing';
import { AI_FALLBACK_REPLY, COMPLAINT_HANDOVER_REPLY, MetaWhatsAppService } from './meta-whatsapp.service';
import { BOT_PAUSED_MARKER } from '../chats/handover';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { OrdersGateway } from '../orders/orders.gateway';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { CustomersService, PRIVACY_NOTICE } from '../customers/customers.service';

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
          // Sin zonas configuradas: domicilio sin flete calculado (como antes de la Fase 2)
          provide: DeliveryZonesService,
          useValue: { quoteForOrder: jest.fn().mockResolvedValue(null) },
        },
        {
          // Cliente que ya autorizó sus datos: las respuestas no llevan el aviso de la Ley 1581
          provide: CustomersService,
          useValue: {
            findByPhone: jest.fn().mockResolvedValue({ id: 'cust-1', termsAcceptedAt: new Date('2026-01-01') }),
            safeTouch: jest.fn().mockResolvedValue({ id: 'cust-1' }),
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
                restaurantId: 'rest-1',
                total: 25000,
                status: 'PENDING',
                createdAt: new Date(),
              }),
              // 2 pedidos antes en la jornada -> turno #03
              count: jest.fn().mockResolvedValue(2),
              findFirst: jest.fn().mockResolvedValue(null),
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
    const textMessage = (body: string) => ({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123456',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '15550234567', phone_number_id: '9988776655' },
                messages: [{ from: '573009876543', id: 'wamid.300', timestamp: '1700000000', type: 'text', text: { body } }],
              },
              field: 'messages',
            },
          ],
        },
      ],
    });

    describe('carta: enlace web en vivo por slug', () => {
      const menuUrl = 'https://kovalcloud.com/menu/pizzeria-napoles';
      beforeEach(() => {
        delete process.env.FRONTEND_URL;
      });

      it('respuesta rápida WEB_LINK sin texto: enlace con el slug (no el id, que da 404)', async () => {
        (prismaService.autoReply.findMany as jest.Mock).mockResolvedValueOnce([
          { responseType: 'WEB_LINK', triggerWords: ['menu'], responseBody: null },
        ]);
        const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

        await service.processIncomingWebhook(textMessage('Menu!'), 'napoles-verify-token');

        expect(sendSpy.mock.calls[0][3]).toContain(menuUrl);
        expect(sendSpy.mock.calls[0][3]).not.toContain('/menu/rest-1');
        expect(aiService.parseOrderIntent).not.toHaveBeenCalled();
      });

      it('respuesta rápida PDF_DOCUMENT sin URL válida: carta web, nunca el PDF de prueba', async () => {
        (prismaService.autoReply.findMany as jest.Mock).mockResolvedValueOnce([
          { responseType: 'PDF_DOCUMENT', triggerWords: ['carta'], responseBody: '' },
        ]);
        const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});
        const docSpy = jest.spyOn(service, 'sendDocumentMessage');

        await service.processIncomingWebhook(textMessage('carta'), 'napoles-verify-token');

        expect(docSpy).not.toHaveBeenCalled();
        expect(sendSpy.mock.calls[0][3]).toContain(menuUrl);
        expect(sendSpy.mock.calls[0][3]).not.toContain('w3.org');
      });

      it('respuesta rápida PDF_DOCUMENT con URL configurada: se sigue enviando el PDF', async () => {
        (prismaService.autoReply.findMany as jest.Mock).mockResolvedValueOnce([
          { responseType: 'PDF_DOCUMENT', triggerWords: ['carta'], responseBody: 'https://cdn.local/carta.pdf' },
        ]);
        const docSpy = jest.spyOn(service, 'sendDocumentMessage').mockResolvedValueOnce({});

        await service.processIncomingWebhook(textMessage('carta'), 'napoles-verify-token');

        expect(docSpy.mock.calls[0][3]).toBe('https://cdn.local/carta.pdf');
      });

      it('la IA detecta que pide el menú: responde con el enlace a la carta en vivo', async () => {
        (aiService.parseOrderIntent as jest.Mock).mockResolvedValueOnce({
          intent: 'QUESTION',
          items: [],
          sendMenuLink: true,
          responseToUser: 'Te comparto nuestra carta en línea, con fotos y disponibilidad en tiempo real.',
        });
        const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});
        const docSpy = jest.spyOn(service, 'sendDocumentMessage');

        await service.processIncomingWebhook(textMessage('pásame la carta'), 'napoles-verify-token');

        expect(docSpy).not.toHaveBeenCalled();
        expect(sendSpy.mock.calls[0][3]).toBe(
          `Te comparto nuestra carta en línea, con fotos y disponibilidad en tiempo real.\n\n📲 Carta en vivo: ${menuUrl}`,
        );
      });

      it('pide el PDF pero el local no lo subió: enlace a la carta web', async () => {
        (aiService.parseOrderIntent as jest.Mock).mockResolvedValueOnce({
          intent: 'QUESTION',
          items: [],
          sendMenuPdf: true,
          responseToUser: 'Claro.',
        });
        const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

        await service.processIncomingWebhook(textMessage('mándame la carta en pdf'), 'napoles-verify-token');

        expect(sendSpy.mock.calls[0][3]).toBe(`Claro.\n\n📲 Carta en vivo: ${menuUrl}`);
      });
    });

    it('should resolve restaurant from DB, store chat history and pass context to AI', async () => {
      const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});
      // Simula que la consulta con orderBy desc devuelve el más reciente primero
      const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
      (prismaService.chatHistory.findMany as jest.Mock).mockResolvedValueOnce([
        { role: 'model', message: '¡Hola! Bienvenido', createdAt: minutesAgo(5) },
        { role: 'user', message: 'hola', createdAt: minutesAgo(6) },
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
          expect.objectContaining({ role: 'user', message: 'hola' }),
          expect.objectContaining({ role: 'model', message: '¡Hola! Bienvenido' }),
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

    it('"reset" ya no es un comando público: no marca reinicio ni responde "Memoria borrada"', async () => {
      const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

      await service.processIncomingWebhook(textMessage('reset'), 'napoles-verify-token');

      const created = (prismaService.chatHistory.create as jest.Mock).mock.calls.map(([arg]) => arg.data);
      expect(created).not.toContainEqual(expect.objectContaining({ message: '[SYSTEM_RESET_CONTEXT]' }));
      expect(sendSpy.mock.calls.map((c) => c[3])).not.toContainEqual(expect.stringContaining('Memoria borrada'));
      // Llega a la IA como cualquier otro mensaje
      expect(aiService.parseOrderIntent).toHaveBeenCalledWith('reset', expect.any(String), [], 'Pizzería Nápoles');
    });

    it('sesión de 3 h: tras más de 3 h sin mensajes no se arrastra el carrito ni el pedido anterior', async () => {
      jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});
      const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
      (prismaService.chatHistory.findMany as jest.Mock).mockResolvedValueOnce([
        { role: 'model', message: 'Tu total es $35.000. ¿Confirmas?', createdAt: hoursAgo(4) },
        { role: 'user', message: 'una pizza para domicilio', createdAt: hoursAgo(4.1) },
      ]);

      await service.processIncomingWebhook(textMessage('sí'), 'napoles-verify-token');

      expect(aiService.parseOrderIntent).toHaveBeenCalledWith('sí', expect.any(String), [], 'Pizzería Nápoles');
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

    const confirmedTakeaway = (paymentMethod?: 'CASH' | 'TRANSFER') => ({
      intent: 'ORDER',
      orderType: 'TAKEAWAY',
      items: [{ productId: 'item-1', quantity: 1 }],
      customerConfirmed: true,
      readyToConfirm: true,
      customerName: 'Ana',
      paymentMethod,
      responseToUser: 'Perfecto.',
    });

    const confirmOrder = async (paymentMethod?: 'CASH' | 'TRANSFER') => {
      jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce({
        ...baseRestaurant,
        paymentDetails: 'Nequi 300 123 4567 (Juan)',
      } as any);
      (prismaService.order as any).findFirst = jest.fn().mockResolvedValue(null);
      (aiService.parseOrderIntent as jest.Mock).mockResolvedValueOnce(confirmedTakeaway(paymentMethod));
      const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});
      await service.processIncomingWebhook(textPayload('sí, confirmo'), 'napoles-verify-token');
      return sendSpy.mock.calls[0][3] as string;
    };

    it('transferencia: confirma con el turno, los datos de pago y pide el comprobante', async () => {
      const sentText = await confirmOrder('TRANSFER');

      expect(sentText).toContain('Pedido confirmado');
      expect(sentText).toContain('💳 *Datos de pago:*\nNequi 300 123 4567 (Juan)');
      expect(sentText).toContain('Por favor envíanos la captura del comprobante por aquí.');
      expect((prismaService.order.create as jest.Mock).mock.calls.at(-1)[0].data.paymentMethod).toBe('TRANSFERENCIA');
    });

    it('efectivo: confirma con el turno SIN números de cuenta y registra el pedido como CASH', async () => {
      const sentText = await confirmOrder('CASH');

      expect(sentText).toContain('Pedido confirmado');
      expect(sentText).toContain('Pagas en efectivo al recoger.');
      expect(sentText).not.toContain('Datos de pago');
      expect(sentText).not.toContain('Nequi');
      expect((prismaService.order.create as jest.Mock).mock.calls.at(-1)[0].data.paymentMethod).toBe('CASH');
    });

    it('sin método de pago no confirma ni registra: pregunta efectivo o transferencia', async () => {
      const createCalls = (prismaService.order.create as jest.Mock).mock.calls.length;
      const sentText = await confirmOrder(undefined);

      expect(sentText).toBe('Perfecto.\n\n¿Pagas en efectivo al recoger o por transferencia?');
      expect((prismaService.order.create as jest.Mock).mock.calls.length).toBe(createCalls);
    });

    it('si la IA falla (incluso tras reintentar) el bot responde igual y no se queda callado', async () => {
      jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce(baseRestaurant as any);
      (aiService.parseOrderIntent as jest.Mock).mockRejectedValueOnce(new Error('No object generated: response did not match schema'));
      const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

      await service.processIncomingWebhook(textPayload('quiero una coca-cola'), 'napoles-verify-token');

      expect(sendSpy).toHaveBeenCalledWith('9988776655', 'EAAB_TEST_TOKEN', '573009876543', AI_FALLBACK_REPLY, false);
    });

    it('si el armado del pedido falla, responde con el texto de la IA', async () => {
      jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce(baseRestaurant as any);
      (aiService.parseOrderIntent as jest.Mock).mockResolvedValueOnce({
        intent: 'ORDER',
        orderType: 'TAKEAWAY',
        items: [{ productId: 'item-1', quantity: 1 }],
        customerConfirmed: true,
        readyToConfirm: true,
        paymentMethod: 'CASH',
        responseToUser: 'No tenemos Coca-Cola, pero tenemos Limonada Cerezada. ¿Para domicilio o recoger?',
      });
      (prismaService.order as any).findFirst = jest.fn().mockRejectedValue(new Error('db caída'));
      const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

      await service.processIncomingWebhook(textPayload('sí'), 'napoles-verify-token');

      expect(sendSpy.mock.calls[0][3]).toBe('No tenemos Coca-Cola, pero tenemos Limonada Cerezada. ¿Para domicilio o recoger?');
    });

    it('reclamo: pausa el bot (handover a humano) y responde sin intentar vender', async () => {
      jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce(baseRestaurant as any);
      (aiService.parseOrderIntent as jest.Mock).mockResolvedValueOnce({
        intent: 'COMPLAINT',
        items: [],
        responseToUser: '¿Te provoca algo más?',
      });
      const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

      await service.processIncomingWebhook(textPayload('el pedido llegó frío y falta la gaseosa'), 'napoles-verify-token');

      expect(sendSpy.mock.calls[0][3]).toBe(COMPLAINT_HANDOVER_REPLY);
      const created = (prismaService.chatHistory.create as jest.Mock).mock.calls.map(([arg]) => arg.data);
      expect(created).toContainEqual(expect.objectContaining({ role: 'system', message: BOT_PAUSED_MARKER }));
    });

    it('"¿cómo va mi pedido?": responde con el estado real de la BD', async () => {
      jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce(baseRestaurant as any);
      (prismaService.order as any).findFirst = jest.fn().mockResolvedValue({
        id: 'o-9', restaurantId: 'rest-1', createdAt: new Date(), status: 'PREPARING', orderType: 'DELIVERY',
        archivedAt: null, driverName: null, paymentMethod: 'CASH', paymentStatus: 'PENDING',
      });
      (aiService.parseOrderIntent as jest.Mock).mockResolvedValueOnce({ intent: 'ORDER_STATUS', items: [], responseToUser: 'Ya casi' });
      const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

      await service.processIncomingWebhook(textPayload('cómo va mi pedido?'), 'napoles-verify-token');

      expect(sendSpy.mock.calls[0][3]).toBe('Tu pedido #03 está en preparación en la cocina.');
    });

    it('agregar tras confirmar: suma al pedido abierto (no crea otro ni recobra lo anterior)', async () => {
      jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce(baseRestaurant as any);
      const open = { id: 'o-7', restaurantId: 'rest-1', createdAt: new Date(), status: 'PENDING', total: 25000, notes: null };
      (prismaService.order as any).findFirst = jest.fn().mockResolvedValue(open);
      (prismaService.order as any).update = jest.fn().mockResolvedValue({ ...open, total: 50000, items: [] });
      (aiService.parseOrderIntent as jest.Mock).mockResolvedValueOnce({
        intent: 'ORDER',
        addToPreviousOrder: true,
        items: [{ productId: 'item-1', quantity: 1 }],
        customerConfirmed: true,
        readyToConfirm: true,
        responseToUser: 'Listo.',
      });
      const createCalls = (prismaService.order.create as jest.Mock).mock.calls.length;
      const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

      await service.processIncomingWebhook(textPayload('sí, agrégala'), 'napoles-verify-token');

      expect((prismaService.order.create as jest.Mock).mock.calls.length).toBe(createCalls);
      const update = (prismaService.order as any).update.mock.calls[0][0];
      expect(update.where).toEqual({ id: 'o-7' });
      expect(update.data.total).toEqual({ increment: 25000 });
      expect(update.data.items.create).toEqual([{ menuItemId: 'item-1', quantity: 1, unitPrice: 25000, subtotal: 25000 }]);
      expect(sendSpy.mock.calls[0][3]).toBe('✅ Listo, agregamos 1x Pizza Margherita a tu pedido #03. Nuevo total en productos: $50.000.');
    });

    it('mensajes en ráfaga del mismo chat se procesan en orden, uno a la vez', async () => {
      const events: string[] = [];
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      (aiService.parseOrderIntent as jest.Mock)
        .mockImplementationOnce(async (text: string) => {
          events.push(`start:${text}`);
          await gate;
          events.push(`end:${text}`);
          return { intent: 'GREETING', items: [], responseToUser: 'Hola' };
        })
        .mockImplementationOnce(async (text: string) => {
          events.push(`start:${text}`);
          return { intent: 'GREETING', items: [], responseToUser: 'Hola' };
        });
      jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValue(baseRestaurant as any);
      jest.spyOn(service, 'sendTextMessage').mockResolvedValue({});

      const first = service.processIncomingWebhook(textPayload('uno'), 'napoles-verify-token');
      const second = service.processIncomingWebhook(textPayload('dos'), 'napoles-verify-token');
      await new Promise((r) => setTimeout(r, 20));
      expect(events).toEqual(['start:uno']); // "dos" espera a que termine "uno"
      release();
      await Promise.all([first, second]);
      expect(events).toEqual(['start:uno', 'end:uno', 'start:dos']);
    });

    describe('mensaje "Acabo de hacer el pedido" de la carta web', () => {
      const webMessage = '¡Hola Pizzería Nápoles! Soy Ana Gómez 👋\nAcabo de hacer el pedido *#07*:\n\n• 1x Pizza — $25.000';
      const webOrder = (extra: Record<string, unknown> = {}) => ({
        id: 'o-7',
        restaurantId: 'rest-1',
        createdAt: new Date(),
        customerName: 'Ana Gómez',
        customerPhone: '573009876543',
        orderType: 'DELIVERY',
        status: 'PENDING',
        paymentMethod: 'CASH',
        paymentStatus: 'PENDING',
        ...extra,
      });

      it('responde el acuse fijo (recibido y en preparación) sin pasar por la IA', async () => {
        jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce(baseRestaurant as any);
        (prismaService.order as any).findFirst = jest.fn().mockResolvedValue(webOrder());
        const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

        await service.processIncomingWebhook(textPayload(webMessage), 'napoles-verify-token');

        expect(sendSpy.mock.calls[0][3]).toBe(
          '¡Hola Ana! Recibimos tu pedido *#07*. 👨‍🍳 El equipo ya lo está preparando en cocina. Te notificaremos por aquí cuando salga con el repartidor.',
        );
        expect(aiService.parseOrderIntent).not.toHaveBeenCalled();
        // El turno #07 es el séptimo pedido de la jornada
        expect((prismaService.order as any).findFirst.mock.calls[0][0]).toMatchObject({ skip: 6, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
      });

      it('transferencia: agrega los datos de pago del local', async () => {
        jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce({ ...baseRestaurant, paymentDetails: 'Nequi 300 123 4567' } as any);
        (prismaService.order as any).findFirst = jest.fn().mockResolvedValue(webOrder({ paymentMethod: 'TRANSFERENCIA' }));
        const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

        await service.processIncomingWebhook(textPayload(webMessage), 'napoles-verify-token');

        expect(sendSpy.mock.calls[0][3]).toContain('💳 *Datos de pago:*\nNequi 300 123 4567');
      });

      it('desde otro número no muestra el nombre del pedido: usa el que escribió el cliente', async () => {
        jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce(baseRestaurant as any);
        (prismaService.order as any).findFirst = jest.fn().mockResolvedValue(webOrder({ customerName: 'Otra Persona', customerPhone: '573110000000' }));
        const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

        await service.processIncomingWebhook(textPayload(webMessage), 'napoles-verify-token');

        expect(sendSpy.mock.calls[0][3]).toMatch(/^¡Hola Ana! Recibimos tu pedido/);
      });

      it('si ya se despachó, responde su estado real; si no existe, sigue la IA', async () => {
        jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce(baseRestaurant as any);
        (prismaService.order as any).findFirst = jest.fn().mockResolvedValue(webOrder({ status: 'DELIVERED', driverName: 'Juan' }));
        const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValue({});
        await service.processIncomingWebhook(textPayload(webMessage), 'napoles-verify-token');
        expect(sendSpy.mock.calls[0][3]).toBe('Tu pedido #07 va en camino con Juan.');

        jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce(baseRestaurant as any);
        (prismaService.order as any).findFirst = jest.fn().mockResolvedValue(null);
        await service.processIncomingWebhook(textPayload(webMessage), 'napoles-verify-token');
        expect(aiService.parseOrderIntent).toHaveBeenCalledTimes(1);
      });
    });

    describe('Habeas Data (Ley 1581) y domicilio por zonas', () => {
      let customers: { findByPhone: jest.Mock; safeTouch: jest.Mock };
      let zones: { quoteForOrder: jest.Mock };
      beforeEach(() => {
        customers = (service as any).customers;
        zones = (service as any).deliveryZones;
      });
      /** chatHistory.findFirst: el aviso ya se envió (o no) a este cliente */
      const noticeAlreadySent = (sent: boolean) =>
        (prismaService.chatHistory.findFirst as jest.Mock).mockImplementation(({ where }) =>
          Promise.resolve(where?.message?.contains === PRIVACY_NOTICE && sent ? { id: 'h1' } : null),
        );

      it('primer contacto: la respuesta lleva el aviso al pie y aún no se marca la autorización', async () => {
        customers.findByPhone.mockResolvedValueOnce(null);
        noticeAlreadySent(false);
        jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce(baseRestaurant as any);
        const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

        await service.processIncomingWebhook(textPayload('hola'), 'napoles-verify-token');

        expect(sendSpy.mock.calls[0][3]).toBe(`¡Hola! Bienvenido\n\n${PRIVACY_NOTICE}`);
        expect(customers.safeTouch).toHaveBeenCalledWith('rest-1', '573009876543', { acceptTerms: false });
        const created = (prismaService.chatHistory.create as jest.Mock).mock.calls.map(([arg]) => arg.data);
        expect(created).toContainEqual(expect.objectContaining({ role: 'model', message: expect.stringContaining('Ley 1581') }));
      });

      it('siguiente mensaje tras el aviso: registra termsAcceptedAt y ya no repite el aviso', async () => {
        customers.findByPhone.mockResolvedValueOnce({ id: 'cust-1', termsAcceptedAt: null });
        noticeAlreadySent(true);
        jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce(baseRestaurant as any);
        const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

        await service.processIncomingWebhook(textPayload('quiero una pizza'), 'napoles-verify-token');

        expect(customers.safeTouch).toHaveBeenCalledWith('rest-1', '573009876543', { acceptTerms: true });
        expect(sendSpy.mock.calls[0][3]).not.toContain('Ley 1581');
      });

      it('el aviso también acompaña una respuesta sin IA (local cerrado)', async () => {
        customers.findByPhone.mockResolvedValueOnce(null);
        noticeAlreadySent(false);
        jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce({
          ...baseRestaurant,
          isTemporarilyClosed: true,
          closedMessage: 'Hoy cerramos',
        } as any);
        const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

        await service.processIncomingWebhook(textPayload('hola'), 'napoles-verify-token');

        expect(sendSpy.mock.calls[0][3]).toBe(`Hoy cerramos\n\n${PRIVACY_NOTICE}`);
      });

      const deliveryIntent = (extra: Record<string, unknown>) => ({
        intent: 'ORDER',
        orderType: 'DELIVERY',
        items: [{ productId: 'item-1', quantity: 1 }],
        deliveryAddress: 'Cra 52 # 98-10',
        neighborhood: 'Riomar',
        customerName: 'Ana',
        paymentMethod: 'CASH',
        readyToConfirm: true,
        customerConfirmed: false,
        responseToUser: 'Perfecto, te dejo el resumen.',
        ...extra,
      });

      it('WhatsApp: el resumen desglosa subtotal, domicilio de la zona y total', async () => {
        jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce(baseRestaurant as any);
        zones.quoteForOrder.mockResolvedValueOnce({ isCovered: true, zoneId: 'z1', zoneName: 'Norte', deliveryFee: 6000, coverageConfigured: true });
        (aiService.parseOrderIntent as jest.Mock).mockResolvedValueOnce(deliveryIntent({}));
        const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

        await service.processIncomingWebhook(textPayload('listo'), 'napoles-verify-token');

        expect(zones.quoteForOrder).toHaveBeenCalledWith('rest-1', 'DELIVERY', 'Riomar', 'Cra 52 # 98-10');
        expect(sendSpy.mock.calls[0][3]).toContain('Subtotal: $25.000\nDomicilio (Norte): $6.000\nTotal: $31.000');
      });

      it('WhatsApp: al confirmar registra subtotal, flete, total, zona y cliente', async () => {
        jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce(baseRestaurant as any);
        (prismaService.order as any).findFirst = jest.fn().mockResolvedValue(null);
        zones.quoteForOrder.mockResolvedValueOnce({ isCovered: true, zoneId: 'z1', zoneName: 'Norte', deliveryFee: 6000, coverageConfigured: true });
        (aiService.parseOrderIntent as jest.Mock).mockResolvedValueOnce(deliveryIntent({ customerConfirmed: true }));
        jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

        await service.processIncomingWebhook(textPayload('sí'), 'napoles-verify-token');

        expect((prismaService.order.create as jest.Mock).mock.calls.at(-1)[0].data).toMatchObject({
          subtotal: 25000,
          deliveryFee: 6000,
          total: 31000,
          neighborhood: 'Riomar',
          deliveryZoneId: 'z1',
          customerId: 'cust-1',
        });
        expect(customers.safeTouch).toHaveBeenCalledWith('rest-1', '573009876543', {
          name: 'Ana',
          address: 'Cra 52 # 98-10',
          neighborhood: 'Riomar',
        });
      });

      it('WhatsApp con tarifa estándar: barrio fuera de las zonas se confirma con "Tarifa general"', async () => {
        jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce(baseRestaurant as any);
        zones.quoteForOrder.mockResolvedValueOnce({ isCovered: true, zoneId: null, zoneName: 'Tarifa general', deliveryFee: 15000, coverageConfigured: true });
        (aiService.parseOrderIntent as jest.Mock).mockResolvedValueOnce(deliveryIntent({ neighborhood: 'Soledad' }));
        const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

        await service.processIncomingWebhook(textPayload('listo'), 'napoles-verify-token');

        expect(sendSpy.mock.calls[0][3]).toContain('Subtotal: $25.000\nDomicilio (Tarifa general): $15.000\nTotal: $40.000');
        expect(sendSpy.mock.calls[0][3]).not.toContain('cobertura');
      });

      it('WhatsApp fuera de cobertura: no confirma ni registra y ofrece recoger', async () => {
        jest.spyOn(prismaService.restaurant, 'findFirst').mockResolvedValueOnce(baseRestaurant as any);
        zones.quoteForOrder.mockResolvedValueOnce({ isCovered: false, deliveryFee: 0, fallback: 'TAKEAWAY', coverageConfigured: true });
        (aiService.parseOrderIntent as jest.Mock).mockResolvedValueOnce(deliveryIntent({ neighborhood: 'Soledad', customerConfirmed: true }));
        const createCalls = (prismaService.order.create as jest.Mock).mock.calls.length;
        const sendSpy = jest.spyOn(service, 'sendTextMessage').mockResolvedValueOnce({});

        await service.processIncomingWebhook(textPayload('sí'), 'napoles-verify-token');

        expect(sendSpy.mock.calls[0][3]).toBe('Por ahora no tenemos cobertura de domicilio en Soledad. ¿Quieres pedirlo para recoger en el local?');
        expect((prismaService.order.create as jest.Mock).mock.calls.length).toBe(createCalls);
      });
    });
  });
});
