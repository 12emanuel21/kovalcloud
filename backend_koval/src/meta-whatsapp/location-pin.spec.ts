import { Test, TestingModule } from '@nestjs/testing';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { OrdersGateway } from '../orders/orders.gateway';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { CustomersService } from '../customers/customers.service';
import { buildLocationPinRule } from './prompts/waiter.prompt';
import {
  buildConfirmationMessage,
  buildDistanceQuoteMessage,
  buildOutOfCoverageMessage,
  formatSharedLocation,
  hasRequiredData,
  latestSharedLocation,
  parseSharedLocation,
} from './order-flow';

const COVERED = { isCovered: true, distanceKm: 3.1, deliveryFee: 7000, zoneId: null, zoneName: '3,1 km', coverageConfigured: true } as const;
const TOO_FAR = { isCovered: false, distanceKm: 9.4, maxRadius: 8, fallback: 'TAKEAWAY', deliveryFee: 0, coverageConfigured: true } as const;

describe('Pin de ubicación de WhatsApp', () => {
  describe('mensaje legible y coordenadas', () => {
    it('formatea y vuelve a leer las coordenadas del pin', () => {
      const text = formatSharedLocation(10.9878123456, -74.7889);
      expect(text).toBe('📍 Ubicación compartida: (10.987812, -74.7889)');
      expect(parseSharedLocation(text)).toEqual({ lat: 10.987812, lng: -74.7889 });
      expect(parseSharedLocation('Calle 30 # 5-10')).toBeNull();
      expect(parseSharedLocation('📍 Ubicación compartida: (95, 10)')).toBeNull();
    });

    it('toma la última ubicación del cliente en la sesión (la del mensaje actual primero)', () => {
      const history = [
        { role: 'user', message: formatSharedLocation(1, 1) },
        { role: 'model', message: formatSharedLocation(9, 9) },
        { role: 'user', message: formatSharedLocation(2, 2) },
        { role: 'user', message: 'sí, confirmo' },
      ];
      expect(latestSharedLocation('sí', history)).toEqual({ lat: 2, lng: 2 });
      expect(latestSharedLocation(formatSharedLocation(3, 3), history)).toEqual({ lat: 3, lng: 3 });
      expect(latestSharedLocation('hola', [])).toBeNull();
    });
  });

  describe('mensajes del envío por distancia', () => {
    const lines = [{ menuItemId: 'i1', name: 'Perro', quantity: 1, unitPrice: 20000, subtotal: 20000 }];
    const ai: any = { intent: 'ORDER', orderType: 'DELIVERY', paymentMethod: 'CASH', items: [] };

    it('distancia, costo y desglose subtotal + envío = total', () => {
      expect(buildDistanceQuoteMessage(COVERED, 20000)).toBe(
        '🛵 Distancia calculada: 3,1 km\n💵 Costo de envío: $7.000 COP\nSubtotal: $20.000 + Envío: $7.000 = Total: $27.000',
      );
      expect(buildDistanceQuoteMessage(COVERED, 0)).toBe('🛵 Distancia calculada: 3,1 km\n💵 Costo de envío: $7.000 COP');
    });

    it('fuera del radio: lo dice con el rango máximo y ofrece recoger', () => {
      const text = 'Tu ubicación está a 9,4 km y supera nuestro rango máximo de domicilio (8 km). ¿Quieres pedirlo para recoger en el local?';
      expect(buildDistanceQuoteMessage(TOO_FAR, 20000)).toBe(text);
      expect(buildOutOfCoverageMessage(ai, TOO_FAR)).toBe(text);
    });

    it('una cotización por zona no produce mensaje de distancia', () => {
      expect(buildDistanceQuoteMessage({ isCovered: true, zoneId: 'z1', zoneName: 'Norte', deliveryFee: 6000, coverageConfigured: true }, 20000)).toBeNull();
    });

    it('con el pin, la dirección escrita es opcional y el resumen muestra la distancia', () => {
      expect(hasRequiredData(ai, lines)).toBe(false);
      expect(hasRequiredData(ai, lines, true)).toBe(true);
      const summary = buildConfirmationMessage(ai, lines, COVERED);
      expect(summary).toContain('🛵 *Domicilio* a: tu ubicación compartida');
      expect(summary).toContain('Subtotal: $20.000 + Envío: $7.000 = Total: $27.000');
      expect(summary).toMatch(/¿Confirmas\?$/);
    });

    it('la regla del pin solo entra al prompt si el local cobra por distancia', () => {
      expect(buildLocationPinRule(false)).toBe('');
      const rule = buildLocationPinRule(true);
      expect(rule).toContain("📍 Por favor compártenos tu ubicación actual por WhatsApp (icono de clip 📎 o '+' -> Ubicación) para calcular el envío exacto.");
      expect(rule).toContain('calculate_delivery_cost');
    });
  });

  describe('flujo del bot', () => {
    let service: MetaWhatsAppService;
    let prisma: any;
    let ai: { parseOrderIntent: jest.Mock };
    let zones: { quoteForOrder: jest.Mock };

    const payload = (message: Record<string, unknown>) => ({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123456',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '15550234567', phone_number_id: '9988776655' },
                messages: [{ from: '573009876543', id: 'wamid.1', timestamp: '1700000000', ...message }],
              },
              field: 'messages',
            },
          ],
        },
      ],
    });
    const pinMessage = { type: 'location', location: { latitude: 10.99, longitude: -74.81, name: 'Casa' } };

    const build = async ({ located = true, history = [] as Array<{ role: string; message: string }>, quote = COVERED as unknown } = {}) => {
      ai = { parseOrderIntent: jest.fn() };
      zones = { quoteForOrder: jest.fn().mockResolvedValue(quote) };
      prisma = {
        restaurant: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'rest-1',
            name: 'Betania',
            slug: 'betania',
            whatsappVerifyToken: 'tok',
            whatsappPhoneId: '9988776655',
            whatsappToken: 'EAAB',
            latitude: located ? 10.98 : null,
            longitude: located ? -74.8 : null,
          }),
        },
        branch: { findMany: jest.fn().mockResolvedValue([]) },
        menuItem: { findMany: jest.fn().mockResolvedValue([{ id: 'item-1', name: 'Perro', price: 20000, isAvailable: true }]) },
        order: {
          create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'o1', createdAt: new Date(), ...data })),
          count: jest.fn().mockResolvedValue(0),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        autoReply: { findMany: jest.fn().mockResolvedValue([]) },
        chatHistory: {
          // Se piden en orden descendente (más reciente primero)
          findMany: jest.fn().mockResolvedValue(history.map((h) => ({ ...h, createdAt: new Date() })).reverse()),
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({}),
        },
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MetaWhatsAppService,
          { provide: AiService, useValue: ai },
          { provide: DeliveryZonesService, useValue: zones },
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
    const delivery = (extra: Record<string, unknown> = {}) => ({
      intent: 'ORDER',
      orderType: 'DELIVERY',
      items: [{ productId: 'item-1', quantity: 1 }],
      responseToUser: 'Listo, ya tengo tu ubicación. ¿A nombre de quién?',
      ...extra,
    });
    const run = async (message: Record<string, unknown>, aiResult: Record<string, unknown>) => {
      ai.parseOrderIntent.mockResolvedValueOnce(aiResult);
      const send = jest.spyOn(service, 'sendTextMessage').mockResolvedValue({});
      await service.processIncomingWebhook(payload(message), 'tok');
      return send.mock.calls[0]?.[3] as string;
    };

    it('el pin se guarda en el chat como texto legible y la IA lo recibe (con la regla del pin activa)', async () => {
      await build();
      await run(pinMessage, delivery());
      const saved = prisma.chatHistory.create.mock.calls.map(([arg]: any[]) => arg.data.message);
      expect(saved[0]).toBe('📍 Ubicación compartida: (10.99, -74.81)');
      expect(ai.parseOrderIntent.mock.calls[0][0]).toBe('📍 Ubicación compartida: (10.99, -74.81)');
      expect(ai.parseOrderIntent.mock.calls[0][4]).toEqual({ distancePricing: true });
    });

    it('al recibir el pin responde con la distancia, el costo y el total (calculate_delivery_cost)', async () => {
      await build();
      const sent = await run(pinMessage, delivery());
      expect(zones.quoteForOrder).toHaveBeenCalledWith('rest-1', 'DELIVERY', undefined, undefined, { lat: 10.99, lng: -74.81 });
      expect(sent).toContain('¿A nombre de quién?');
      expect(sent).toContain('🛵 Distancia calculada: 3,1 km\n💵 Costo de envío: $7.000 COP\nSubtotal: $20.000 + Envío: $7.000 = Total: $27.000');
    });

    it('pin fuera del radio: avisa el rango máximo y ofrece recoger', async () => {
      await build({ quote: TOO_FAR });
      const sent = await run(pinMessage, delivery());
      expect(sent).toContain('supera nuestro rango máximo de domicilio (8 km)');
      expect(sent).toContain('recoger en el local');
    });

    it('al confirmar, el pedido usa el pin del historial: coordenadas, distancia y envío', async () => {
      await build({ history: [{ role: 'user', message: '📍 Ubicación compartida: (10.99, -74.81)' }] });
      const sent = await run(
        { type: 'text', text: { body: 'sí, confirmo' } },
        delivery({ customerName: 'Ana', paymentMethod: 'CASH', readyToConfirm: true, customerConfirmed: true, responseToUser: 'Perfecto.' }),
      );
      expect(prisma.order.create.mock.calls[0][0].data).toMatchObject({
        customerLat: 10.99,
        customerLng: -74.81,
        deliveryDistanceKm: 3.1,
        deliveryFee: 7000,
        total: 27000,
        deliveryAddress: 'Ubicación compartida por WhatsApp',
      });
      expect(sent).toContain('Pedido confirmado');
    });

    it('local sin coordenadas: la IA se llama como antes (sin la regla del pin)', async () => {
      await build({ located: false });
      await run({ type: 'text', text: { body: 'hola' } }, { intent: 'GREETING', items: [], responseToUser: 'Hola' });
      expect(ai.parseOrderIntent.mock.calls[0]).toHaveLength(4);
    });
  });
});
