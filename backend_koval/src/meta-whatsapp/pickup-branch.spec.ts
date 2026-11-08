import { Test, TestingModule } from '@nestjs/testing';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { OrdersGateway } from '../orders/orders.gateway';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { CustomersService } from '../customers/customers.service';
import { buildPickupBranchesRule } from './prompts/waiter.prompt';
import { buildConfirmationMessage, buildRegisteredMessage } from './order-flow';
import { matchBranchByName } from '../branches/branch-routing';

const BRANCHES = [
  { id: 'b-30', name: 'Calle 30', isMain: true },
  { id: 'b-60', name: 'Calle 60', isMain: false },
];

describe('Sede para recoger por WhatsApp (multisede)', () => {
  describe('emparejar la sede que dice el cliente', () => {
    it('nombre exacto, sin tildes ni mayúsculas, o una parte que solo coincide con una sede', () => {
      expect(matchBranchByName(BRANCHES, 'Calle 60')?.id).toBe('b-60');
      expect(matchBranchByName(BRANCHES, 'CALLE 30')?.id).toBe('b-30');
      expect(matchBranchByName(BRANCHES, 'la de la calle 60')?.id).toBe('b-60');
      expect(matchBranchByName(BRANCHES, '60')?.id).toBe('b-60');
      expect(matchBranchByName(BRANCHES, 'la de la 60 por favor')?.id).toBe('b-60');
    });

    it('ambiguo, vacío o desconocido: null (el sistema usa la principal)', () => {
      expect(matchBranchByName(BRANCHES, 'calle')).toBeNull();
      expect(matchBranchByName(BRANCHES, '')).toBeNull();
      expect(matchBranchByName(BRANCHES, undefined)).toBeNull();
      expect(matchBranchByName(BRANCHES, 'Soledad')).toBeNull();
    });
  });

  describe('prompt y mensajes', () => {
    it('la regla de sede solo aparece con dos o más sedes y lista sus nombres', () => {
      expect(buildPickupBranchesRule([])).toBe('');
      expect(buildPickupBranchesRule(['Calle 30'])).toBe('');
      const rule = buildPickupBranchesRule(['Calle 30', 'Calle 60']);
      expect(rule).toContain('"Calle 30", "Calle 60"');
      expect(rule).toContain('¿En qué sede prefieres recogerlo: Calle 30 o Calle 60?');
      expect(rule).toContain('pickupBranch');
      expect(buildPickupBranchesRule(['Norte', 'Centro', 'Sur'])).toContain('Norte, Centro o Sur');
    });

    it('el resumen y la confirmación dicen en qué sede recoge; sin sede, igual que siempre', () => {
      const ai: any = { intent: 'ORDER', orderType: 'TAKEAWAY', paymentMethod: 'CASH', items: [] };
      const lines = [{ menuItemId: 'i1', name: 'Perro', quantity: 1, unitPrice: 20000, subtotal: 20000 }] as any;
      expect(buildConfirmationMessage(ai, lines, null, 'Calle 60')).toMatch(/^🛍️ \*Para recoger\* en la sede Calle 60\n/);
      expect(buildConfirmationMessage(ai, lines)).toMatch(/^🛍️ \*Para recoger\*\n/);
      expect(buildRegisteredMessage(ai, 4, 'Calle 60')).toBe(
        '✅ Pedido confirmado. Tu turno es el #04. Te avisamos cuando esté listo para recoger en la sede Calle 60.',
      );
      expect(buildRegisteredMessage(ai, 4)).toBe('✅ Pedido confirmado. Tu turno es el #04. Te avisamos cuando esté listo para recoger.');
    });
  });

  describe('flujo del bot', () => {
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

    const build = async (branches: Array<{ id: string; name: string; isMain: boolean }>) => {
      ai = { parseOrderIntent: jest.fn() };
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
        branch: { findMany: jest.fn().mockResolvedValue(branches) },
        menuItem: { findMany: jest.fn().mockResolvedValue([{ id: 'item-1', name: 'Perro', price: 20000, isAvailable: true }]) },
        order: {
          create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'o1', createdAt: new Date(), ...data })),
          count: jest.fn().mockResolvedValue(0),
          findFirst: jest.fn().mockResolvedValue(null),
        },
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
          { provide: OrdersGateway, useValue: { emitNewOrder: jest.fn(), emitOrderUpdated: jest.fn() } },
          { provide: PrismaService, useValue: prisma },
        ],
      }).compile();
      service = module.get(MetaWhatsAppService);
    };

    const takeaway = (extra: Record<string, unknown> = {}) => ({
      intent: 'ORDER',
      orderType: 'TAKEAWAY',
      items: [{ productId: 'item-1', quantity: 1 }],
      customerName: 'Ana',
      paymentMethod: 'CASH',
      readyToConfirm: true,
      customerConfirmed: true,
      responseToUser: 'Perfecto.',
      ...extra,
    });

    const run = async (aiResult: Record<string, unknown>) => {
      ai.parseOrderIntent.mockResolvedValueOnce(aiResult);
      const send = jest.spyOn(service, 'sendTextMessage').mockResolvedValue({});
      await service.processIncomingWebhook(payload('sí, confirmo'), 'tok');
      return send.mock.calls[0]?.[3] as string;
    };

    it('con dos sedes, la IA recibe los nombres para preguntar dónde recoge', async () => {
      await build(BRANCHES);
      await run(takeaway({ pickupBranch: 'Calle 60' }));
      expect(ai.parseOrderIntent.mock.calls[0][4]).toEqual({ pickupBranches: ['Calle 30', 'Calle 60'] });
    });

    it('la sede que dijo el cliente se asigna a la comanda y aparece en la confirmación', async () => {
      await build(BRANCHES);
      const sent = await run(takeaway({ pickupBranch: 'la de la 60' }));
      expect(prisma.order.create.mock.calls[0][0].data.branchId).toBe('b-60');
      expect(sent).toContain('listo para recoger en la sede Calle 60');
    });

    it('si no dijo la sede (o no se reconoce), va a la principal', async () => {
      await build(BRANCHES);
      const sent = await run(takeaway());
      expect(prisma.order.create.mock.calls[0][0].data.branchId).toBe('b-30');
      expect(sent).toContain('en la sede Calle 30');
    });

    it('el resumen antes de confirmar también dice la sede', async () => {
      await build(BRANCHES);
      const sent = await run(takeaway({ customerConfirmed: false, pickupBranch: 'Calle 60' }));
      expect(sent).toContain('🛍️ *Para recoger* en la sede Calle 60');
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('con una sola sede no se pregunta ni se nombra la sede (va a esa sede)', async () => {
      await build([BRANCHES[0]]);
      const sent = await run(takeaway({ pickupBranch: 'Calle 60' }));
      expect(ai.parseOrderIntent.mock.calls[0]).toHaveLength(4);
      expect(prisma.order.create.mock.calls[0][0].data.branchId).toBe('b-30');
      expect(sent).not.toContain('sede');
    });
  });
});
