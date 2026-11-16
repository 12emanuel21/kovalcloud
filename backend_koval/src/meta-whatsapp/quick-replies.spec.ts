import { Test, TestingModule } from '@nestjs/testing';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { OrdersGateway } from '../orders/orders.gateway';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { CustomersService } from '../customers/customers.service';
import { buildQuickReply, detectQuickIntent, hasPendingConfirmation } from './quick-replies';

describe('Atajo de saludo / carta (sin IA)', () => {
  it('detecta saludos simples y pedidos de carta, con o sin tildes, signos y emojis', () => {
    for (const text of ['hola', '¡Hola!', 'HOLA 👋', 'buenas', 'Buenos días', 'buenas tardes', 'Buenas noches!!', 'hola buenas tardes']) {
      expect([text, detectQuickIntent(text)]).toEqual([text, 'greeting']);
    }
    for (const text of ['menu', 'Menú', 'carta', 'La carta', 'ver menú', 'Ver la carta?']) {
      expect([text, detectQuickIntent(text)]).toEqual([text, 'menu']);
    }
  });

  it('un mensaje con más contenido sigue a la IA', () => {
    for (const text of ['hola, quiero 2 perros', 'buenas, ¿tienen domicilio?', 'el menú de hoy tiene sopa?', 'sí', 'carta 2', '', null]) {
      expect([text, detectQuickIntent(text)]).toEqual([text, null]);
    }
  });

  it('con un resumen pendiente de "¿Confirmas?" no aplica el atajo', () => {
    expect(hasPendingConfirmation([{ role: 'model', message: '🛵 *Domicilio*...\n\nTotal: $27.000\n\n¿Confirmas?' }])).toBe(true);
    expect(hasPendingConfirmation([{ role: 'model', message: '¿Confirmas?' }, { role: 'user', message: 'hola' }])).toBe(true);
    expect(hasPendingConfirmation([{ role: 'model', message: '✅ ¡Pedido confirmado! Turno #04' }])).toBe(false);
    expect(hasPendingConfirmation([])).toBe(false);
  });

  it('saludo cordial con la franja del día y el enlace a la carta', () => {
    const greeting = buildQuickReply('greeting', 'Betania Express', 'https://kovalcloud.com/menu/betania', 'tarde');
    expect(greeting).toContain('¡Hola, buenas tardes! 👋 Bienvenido a *Betania Express*.');
    expect(greeting).toContain('📲 Carta en vivo: https://kovalcloud.com/menu/betania');
    expect(buildQuickReply('menu', 'Betania', 'https://x/menu/b', 'noche')).toContain('📲 Carta en vivo: https://x/menu/b');
  });
});

describe('Atajo de saludo en el flujo del bot', () => {
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

  const build = async (history: Array<{ role: string; message: string }> = []) => {
    ai = { parseOrderIntent: jest.fn().mockResolvedValue({ intent: 'QUESTION', items: [], responseToUser: 'Claro.' }) };
    prisma = {
      restaurant: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'rest-1',
          name: 'Betania Express',
          slug: 'betania',
          whatsappVerifyToken: 'tok',
          whatsappPhoneId: '9988776655',
          whatsappToken: 'EAAB',
        }),
      },
      branch: { findMany: jest.fn().mockResolvedValue([]) },
      menuItem: { findMany: jest.fn().mockResolvedValue([{ id: 'item-1', name: 'Perro', price: 20000, isAvailable: true }]) },
      order: { findFirst: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0) },
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
  const send = async (body: string) => {
    const spy = jest.spyOn(service, 'sendTextMessage').mockResolvedValue({});
    await service.processIncomingWebhook(payload(body), 'tok');
    return spy.mock.calls[0]?.[3] as string;
  };
  const savedMessages = () => prisma.chatHistory.create.mock.calls.map(([arg]: any[]) => `${arg.data.role}: ${arg.data.message}`);

  it('"hola" se responde al instante con el saludo y la carta, sin llamar a la IA', async () => {
    await build();
    const reply = await send('¡Hola!');
    expect(ai.parseOrderIntent).not.toHaveBeenCalled();
    expect(reply).toContain('Bienvenido a *Betania Express*');
    expect(reply).toMatch(/📲 Carta en vivo: https?:\/\/\S+\/menu\/betania/);
    expect(savedMessages()).toEqual(['user: ¡Hola!', `model: ${reply}`]);
  });

  it('"carta" también va por el atajo', async () => {
    await build();
    const reply = await send('ver la carta');
    expect(ai.parseOrderIntent).not.toHaveBeenCalled();
    expect(reply).toContain('📲 Carta en vivo:');
  });

  it('con un resumen esperando "¿Confirmas?", el saludo sigue el flujo normal (IA)', async () => {
    await build([
      { role: 'user', message: 'quiero un perro a domicilio' },
      { role: 'model', message: '🛵 *Domicilio*\n• 1x Perro\n\nTu total es $20.000.\n\n¿Confirmas?' },
    ]);
    await send('hola');
    expect(ai.parseOrderIntent).toHaveBeenCalledTimes(1);
  });

  it('un mensaje con pedido no usa el atajo', async () => {
    await build();
    await send('hola, quiero 2 perros');
    expect(ai.parseOrderIntent).toHaveBeenCalledTimes(1);
  });
});
