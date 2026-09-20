import { Test, TestingModule } from '@nestjs/testing';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MetaWhatsAppService', () => {
  let service: MetaWhatsAppService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaWhatsAppService,
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
          },
        },
      ],
    }).compile();

    service = module.get<MetaWhatsAppService>(MetaWhatsAppService);
    prismaService = module.get<PrismaService>(PrismaService);
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
    it('should resolve restaurant from DB and send Botpress replies using restaurant token and phoneId', async () => {
      const forwardSpy = jest
        .spyOn(service, 'forwardToBotpress')
        .mockResolvedValueOnce(['Respuesta personalizada del bot']);
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
                      id: 'wamid.123',
                      timestamp: '1700000000',
                      type: 'text',
                      text: { body: 'Quiero ver el menú' },
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

      expect(forwardSpy).toHaveBeenCalledWith(
        'pizzeria-bot-custom',
        '573009876543',
        'Quiero ver el menú',
      );
      expect(sendSpy).toHaveBeenCalledWith(
        '9988776655',
        'EAAB_TEST_TOKEN',
        '573009876543',
        'Respuesta personalizada del bot',
      );
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