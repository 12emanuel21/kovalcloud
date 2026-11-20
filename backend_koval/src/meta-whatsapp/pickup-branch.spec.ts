import { Test, TestingModule } from '@nestjs/testing';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { OrdersGateway } from '../orders/orders.gateway';
import { CustomersService } from '../customers/customers.service';
import { buildBranchesRule, buildWaiterSystemPrompt } from './prompts/waiter.prompt';
import { buildConfirmationMessage, buildRegisteredMessage } from './order-flow';
import { BRANCH_QUESTION, RESERVATION_BRANCH_QUESTION, buildBranchQuestion, formatBranchList, withBranchList } from './branch-choice';
import { matchBranchByName } from '../branches/branch-routing';

const CALLES = [
  { id: 'b-30', name: 'Calle 30', isMain: true },
  { id: 'b-60', name: 'Calle 60', isMain: false },
];
/** Como las devuelve activeBranchesOf: la principal primero */
const SEDES = [
  { id: 'b-38', name: 'Sede 1', address: 'Cra. 38a #75B-10', isMain: true },
  { id: 'b-31', name: 'Sede 2', address: 'Cra. 31 #70B-70B', isMain: false },
];
const LIST = '• Sede 1: Cra. 38a #75B-10\n• Sede 2: Cra. 31 #70B-70B';

describe('Sede del pedido por WhatsApp (multisede)', () => {
  describe('reconocer la sede que dice el cliente', () => {
    it('nombre exacto, sin tildes ni mayúsculas, o una parte que solo coincide con una sede', () => {
      expect(matchBranchByName(CALLES, 'Calle 60')?.id).toBe('b-60');
      expect(matchBranchByName(CALLES, 'CALLE 30')?.id).toBe('b-30');
      expect(matchBranchByName(CALLES, 'la de la calle 60')?.id).toBe('b-60');
      expect(matchBranchByName(CALLES, '60')?.id).toBe('b-60');
      expect(matchBranchByName(CALLES, 'la de la 60 por favor')?.id).toBe('b-60');
    });

    it('"Sede 1", "la 2" o por la dirección ("la de la 38" reconoce la Cra. 38a)', () => {
      expect(matchBranchByName(SEDES, 'Sede 1')?.id).toBe('b-38');
      expect(matchBranchByName(SEDES, 'la 2')?.id).toBe('b-31');
      expect(matchBranchByName(SEDES, 'la de la 38')?.id).toBe('b-38');
      expect(matchBranchByName(SEDES, 'la de la 31')?.id).toBe('b-31');
      expect(matchBranchByName(SEDES, 'la de la carrera 38a')?.id).toBe('b-38');
    });

    it('ambiguo, vacío o desconocido: null (el bot vuelve a preguntar)', () => {
      expect(matchBranchByName(CALLES, 'calle')).toBeNull();
      expect(matchBranchByName(CALLES, '')).toBeNull();
      expect(matchBranchByName(CALLES, undefined)).toBeNull();
      expect(matchBranchByName(CALLES, 'Soledad')).toBeNull();
      // "Cra." está en las dos direcciones
      expect(matchBranchByName(SEDES, 'la de la cra')).toBeNull();
      // "3" no es "38a" ni "31"
      expect(matchBranchByName(SEDES, 'la 3')).toBeNull();
    });
  });

  describe('prompt', () => {
    it('la regla de sede solo aparece con dos o más sedes y lista cada una con su dirección', () => {
      expect(buildBranchesRule([])).toBe('');
      expect(buildBranchesRule([SEDES[0]])).toBe('');
      const rule = buildBranchesRule(SEDES);
      expect(rule).toContain(`Sedes del local (nombre: dirección):\n${LIST}\n`);
      expect(rule).toContain(BRANCH_QUESTION);
      expect(rule).toContain(RESERVATION_BRANCH_QUESTION);
      expect(rule).toContain('domicilio, recoger o reserva de mesa');
      expect(rule).toContain('no pongas readyToConfirm = true hasta que la elija');
      expect(rule).toContain('pon en branch el nombre EXACTO');
    });

    it('el prompt la incluye solo para marcas multisede; un salto de línea del dueño no rompe la lista', () => {
      const base = { restaurantName: 'Betania', dayPart: 'tarde', menu: '- [item-1] Perro: $20000' };
      expect(buildWaiterSystemPrompt({ ...base, branches: SEDES })).toContain('## Regla 3.1 — Sede del pedido');
      expect(buildWaiterSystemPrompt({ ...base, branches: [SEDES[0]] })).not.toContain('Regla 3.1');
      expect(buildWaiterSystemPrompt(base)).not.toContain('Regla 3.1');
      expect(formatBranchList([{ name: ' Sede\n1 ', address: 'Cra. 38a\n#75B-10' }, { name: 'Sede 2', address: '' }])).toBe(
        '• Sede 1: Cra. 38a #75B-10\n• Sede 2',
      );
    });
  });

  describe('mensajes', () => {
    it('la pregunta del backend muestra las sedes con su dirección; en una reserva, la variante de reserva', () => {
      expect(buildBranchQuestion(SEDES, 'DELIVERY')).toBe(`Antes de confirmar, estas son nuestras sedes:\n${LIST}\n\n${BRANCH_QUESTION}`);
      expect(buildBranchQuestion(SEDES, 'TAKEAWAY')).toContain(BRANCH_QUESTION);
      expect(buildBranchQuestion(SEDES, 'DINE_IN')).toBe(`Antes de confirmar, estas son nuestras sedes:\n${LIST}\n\n${RESERVATION_BRANCH_QUESTION}`);
    });

    it('si la IA pregunta la sede sin la lista, se agrega antes de la pregunta; con la lista o sin pregunta, igual', () => {
      expect(withBranchList(`Perfecto, Ana. ${BRANCH_QUESTION}`, SEDES)).toBe(`Perfecto, Ana.\n\n${LIST}\n\n${BRANCH_QUESTION}`);
      const complete = `Tenemos dos sedes:\n${LIST}\n\n${BRANCH_QUESTION}`;
      expect(withBranchList(complete, SEDES)).toBe(complete);
      expect(withBranchList('¿A nombre de quién?', SEDES)).toBe('¿A nombre de quién?');
      // Solo los nombres, sin direcciones: se agregan
      expect(withBranchList(`¿Sede 1 o Sede 2? ${BRANCH_QUESTION}`, SEDES)).toBe(`¿Sede 1 o Sede 2?\n\n${LIST}\n\n${BRANCH_QUESTION}`);
    });

    it('el resumen y la confirmación dicen la sede en domicilio, recoger y reserva; sin sede, igual que siempre', () => {
      const lines = [{ menuItemId: 'i1', name: 'Perro', quantity: 1, unitPrice: 20000, subtotal: 20000 }] as any;
      const takeaway: any = { intent: 'ORDER', orderType: 'TAKEAWAY', paymentMethod: 'CASH', items: [] };
      expect(buildConfirmationMessage(takeaway, lines, null, 'Sede 2')).toMatch(/^🛍️ \*Para recoger\* en la sede Sede 2\n/);
      expect(buildConfirmationMessage(takeaway, lines)).toMatch(/^🛍️ \*Para recoger\*\n/);
      expect(buildRegisteredMessage(takeaway, 4, 'Sede 2')).toBe(
        '✅ Pedido confirmado. Tu turno es el #04. Te avisamos cuando esté listo para recoger en la sede Sede 2.',
      );
      expect(buildRegisteredMessage(takeaway, 4)).toBe('✅ Pedido confirmado. Tu turno es el #04. Te avisamos cuando esté listo para recoger.');

      const delivery: any = { intent: 'ORDER', orderType: 'DELIVERY', paymentMethod: 'CASH', deliveryAddress: 'Cra 52 # 76-10', items: [] };
      const pending = { deliveryFee: 0, deliveryFeePending: true };
      expect(buildConfirmationMessage(delivery, lines, pending, 'Sede 2')).toMatch(/^🛵 \*Domicilio\* a: Cra 52 # 76-10\nSede: Sede 2\n• 1x Perro/);
      expect(buildConfirmationMessage(delivery, lines, pending)).toMatch(/^🛵 \*Domicilio\* a: Cra 52 # 76-10\n• 1x Perro/);

      const reservation: any = { intent: 'RESERVATION', orderType: 'DINE_IN', reservation: { people: 2, time: '8:00 pm' }, items: [] };
      expect(buildConfirmationMessage(reservation, [], null, 'Sede 1')).toBe(
        '📅 *Reserva de mesa* para 2 personas a las 8:00 pm en la sede Sede 1.\n\n¿Confirmas?',
      );
      expect(buildRegisteredMessage(reservation, 3, 'Sede 1')).toBe('✅ Reserva confirmada. Tu turno es el #03. Te esperamos en la sede Sede 1.');
      expect(buildRegisteredMessage(reservation, 3)).toBe('✅ Reserva confirmada. Tu turno es el #03. Te esperamos.');
    });
  });

  describe('flujo del bot', () => {
    let service: MetaWhatsAppService;
    let prisma: any;
    let ai: { parseOrderIntent: jest.Mock };
    let emitted: Array<{ room: string; event: string; payload: any }>;

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

    const build = async (branches: Array<{ id: string; name: string; isMain: boolean; address?: string }>) => {
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
          createMany: jest.fn().mockResolvedValue({}),
        },
      };
      // Gateway real con un servidor falso: se ve a qué salas llega el pedido
      emitted = [];
      const gateway = new OrdersGateway({} as any, {} as any);
      gateway.server = {
        to: (room: string) => ({ emit: (event: string, data: any) => emitted.push({ room, event, payload: data }) }),
      } as any;
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MetaWhatsAppService,
          { provide: AiService, useValue: ai },
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

    const order = (orderType: 'DELIVERY' | 'TAKEAWAY', extra: Record<string, unknown> = {}) => ({
      intent: 'ORDER',
      orderType,
      items: [{ productId: 'item-1', quantity: 1 }],
      customerName: 'Ana',
      ...(orderType === 'DELIVERY' ? { deliveryAddress: 'Cra 52 # 76-10', neighborhood: 'Prado' } : {}),
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

    it('con dos sedes, la IA recibe el nombre y la dirección de cada una para preguntar', async () => {
      await build(SEDES);
      await run(order('TAKEAWAY', { branch: 'Sede 2' }));
      expect(ai.parseOrderIntent.mock.calls[0][4]).toEqual({
        branches: [
          { name: 'Sede 1', address: 'Cra. 38a #75B-10' },
          { name: 'Sede 2', address: 'Cra. 31 #70B-70B' },
        ],
      });
    });

    it.each(['DELIVERY', 'TAKEAWAY'] as const)('%s sin sede elegida: en vez del resumen, las sedes con su dirección y la pregunta', async (type) => {
      await build(SEDES);
      const sent = await run(order(type, { customerConfirmed: false }));
      expect(sent).toBe(buildBranchQuestion(SEDES, type));
      expect(sent).toContain(LIST);
      expect(sent).not.toContain('¿Confirmas?');
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it.each(['DELIVERY', 'TAKEAWAY'] as const)('%s: aunque la IA marque la confirmación, sin sede no se registra el pedido', async (type) => {
      await build(SEDES);
      const sent = await run(order(type));
      expect(sent).toContain(BRANCH_QUESTION);
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('una reserva de mesa sin sede: la pregunta de la reserva', async () => {
      await build(SEDES);
      const sent = await run({
        intent: 'RESERVATION',
        orderType: 'DINE_IN',
        items: [],
        customerName: 'Ana',
        reservation: { people: 4, time: '8:00 pm' },
        readyToConfirm: true,
        customerConfirmed: false,
        responseToUser: 'Listo.',
      });
      expect(sent).toContain(`${LIST}\n\n${RESERVATION_BRANCH_QUESTION}`);
    });

    it('si falta el método de pago, primero se pregunta eso (la sede después)', async () => {
      await build(SEDES);
      const sent = await run(order('DELIVERY', { paymentMethod: undefined, customerConfirmed: false }));
      expect(sent).toContain('¿Pagas en efectivo al recibir o por transferencia?');
      expect(sent).not.toContain(BRANCH_QUESTION);
    });

    it('DELIVERY: el resumen dice la sede elegida', async () => {
      await build(SEDES);
      const sent = await run(order('DELIVERY', { customerConfirmed: false, branch: 'la 2' }));
      expect(sent).toContain('🛵 *Domicilio* a: Cra 52 # 76-10, Prado\nSede: Sede 2\n');
      expect(sent).toContain('¿Confirmas?');
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('DELIVERY confirmado: el pedido va a la sede elegida y llega al instante a su KDS y al tablero del dueño', async () => {
      await build(SEDES);
      await run(order('DELIVERY', { branch: 'la de la 31' }));
      expect(prisma.order.create.mock.calls[0][0].data.branchId).toBe('b-31');
      const rooms = emitted.filter((e) => e.event === 'new_order').map((e) => e.room);
      expect(rooms).toEqual(expect.arrayContaining(['restaurant_rest-1', 'restaurant_rest-1_kitchen_b-31']));
      expect(rooms).not.toContain('restaurant_rest-1_kitchen_b-38');
    });

    it('TAKEAWAY confirmado: la sede elegida va a la comanda y a la confirmación', async () => {
      await build(SEDES);
      const sent = await run(order('TAKEAWAY', { branch: 'Sede 2' }));
      expect(prisma.order.create.mock.calls[0][0].data.branchId).toBe('b-31');
      expect(sent).toContain('listo para recoger en la sede Sede 2');
    });

    it('la IA pregunta la sede sin la lista: se agrega con las direcciones', async () => {
      await build(SEDES);
      const sent = await run(order('DELIVERY', { readyToConfirm: false, customerConfirmed: false, responseToUser: `Listo, Ana. ${BRANCH_QUESTION}` }));
      expect(sent).toBe(`Listo, Ana.\n\n${LIST}\n\n${BRANCH_QUESTION}`);
    });

    it('con una sola sede no se pregunta ni se nombra: el pedido va a esa sede', async () => {
      await build([SEDES[0]]);
      const sent = await run(order('DELIVERY', { branch: 'Sede 2' }));
      expect(ai.parseOrderIntent.mock.calls[0]).toHaveLength(4);
      expect(prisma.order.create.mock.calls[0][0].data.branchId).toBe('b-38');
      expect(sent).not.toContain('sede');
      expect(emitted.map((e) => e.room)).toContain('restaurant_rest-1_kitchen_b-38');
    });

    it('sin sedes: no se pregunta y el pedido queda como un solo local', async () => {
      await build([]);
      const sent = await run(order('TAKEAWAY'));
      expect(prisma.order.create.mock.calls[0][0].data).not.toHaveProperty('branchId');
      expect(sent).not.toContain(BRANCH_QUESTION);
    });
  });
});
