import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersGateway } from './orders.gateway';
import { SetDeliveryFeeDto } from './dto/set-delivery-fee.dto';
import { KITCHEN_ACCESS_KEY } from '../auth/decorators/kitchen-access.decorator';
import {
  DEFAULT_DELIVERY_FEE_PRESETS,
  buildDeliveryFeeMessage,
  cleanDeliveryFeePresets,
  initialDeliveryFee,
  resolveDeliveryFeePresets,
} from './delivery-fee';
import { WompiCheckoutService } from '../payments/wompi-checkout.service';

const ORDER_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const owner = { role: Role.OWNER, restaurantId: 'rest-1' };
const kitchen = { role: Role.KITCHEN, restaurantId: 'rest-1' };
const flush = () => new Promise((r) => setImmediate(r));
const notFound = () => new Prisma.PrismaClientKnownRequestError('Record to update not found.', { code: 'P2025', clientVersion: '5.22.0' });

const restaurant = {
  id: 'rest-1',
  name: 'Betania Express',
  slug: 'betania',
  whatsappPhoneId: null,
  whatsappToken: null,
  paymentDetails: 'Nequi 300 000 0000 · Bancolombia ahorros 123-456',
  isWompiEnabled: false,
  wompiPublicKey: null,
  wompiIntegritySecret: null,
  wompiEventSecret: null,
};

/** Prisma simulado con una fila: el UPDATE condicionado se evalúa contra el estado actual */
function build(fields: Record<string, unknown> = {}, restaurantFields: Record<string, unknown> = {}) {
  const row: Record<string, any> = {
    id: ORDER_ID,
    restaurantId: 'rest-1',
    customerName: 'Ana',
    customerPhone: '573001112233',
    orderType: 'DELIVERY',
    status: 'PENDING',
    paymentStatus: 'PENDING',
    paymentMethod: 'TRANSFERENCIA',
    paymentReference: null,
    subtotal: 20000,
    deliveryFee: 0,
    deliveryFeePending: true,
    total: 20000,
    branchId: 'sede-1',
    createdAt: new Date(),
    items: [],
    ...fields,
  };
  const rest = { ...restaurant, ...restaurantFields };
  const prisma: any = {
    order: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve({ ...row })),
      count: jest.fn().mockResolvedValue(6), // turno #07
      update: jest.fn().mockImplementation(async ({ where, data }) => {
        const matches =
          (where.subtotal === undefined || where.subtotal === row.subtotal) &&
          (!where.paymentStatus?.not || row.paymentStatus !== where.paymentStatus.not) &&
          (!where.status?.notIn || !where.status.notIn.includes(row.status));
        if (!matches) throw notFound();
        Object.assign(row, data);
        return { ...row, restaurant: rest };
      }),
    },
    branch: { findFirst: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.id === 'sede-2' ? { id: 'sede-2' } : null)) },
    restaurant: { findUnique: jest.fn() },
  };
  const gateway: any = { emitOrderUpdated: jest.fn(), emitOrderLeftBranch: jest.fn() };
  const whatsapp: any = { sendTextMessage: jest.fn().mockResolvedValue({}), recordBotMessage: jest.fn().mockResolvedValue(undefined) };
  const service = new OrdersService(prisma, gateway, whatsapp, new WompiCheckoutService(prisma), {} as any);
  return { row, prisma, gateway, whatsapp, service };
}

describe('PATCH /orders/:id/delivery-fee (botones rápidos del Kanban)', () => {
  it('define el domicilio: total = productos + domicilio, deja de estar pendiente y SIGUE en Pendientes', async () => {
    const { row, prisma, gateway, service } = build();
    const response = await service.setDeliveryFee(ORDER_ID, { deliveryFee: 5000 }, owner);

    expect(prisma.order.update.mock.calls[0][0].data).toEqual({ deliveryFee: 5000, deliveryFeePending: false, total: 25000 });
    // La condición evita pisar un total viejo (adición por WhatsApp, pago o despacho entretanto)
    expect(prisma.order.update.mock.calls[0][0].where).toEqual({
      id: ORDER_ID,
      subtotal: 20000,
      paymentStatus: { not: 'PAID' },
      status: { notIn: ['DELIVERED', 'CANCELLED'] },
    });
    expect(row).toMatchObject({ status: 'PENDING', deliveryFee: 5000, deliveryFeePending: false, total: 25000 });
    expect(response).toMatchObject({ status: 'PENDING', total: 25000, dailyNumber: 7 });
    // El Kanban se actualiza en vivo (sin pasar a cocina)
    expect(gateway.emitOrderUpdated).toHaveBeenCalledWith('rest-1', expect.objectContaining({ id: ORDER_ID, total: 25000, status: 'PENDING' }));
    expect(gateway.emitOrderLeftBranch).not.toHaveBeenCalled();
  });

  it('avisa al cliente por WhatsApp: domicilio, total definitivo y medios de pago; queda en el chat', async () => {
    const { service, whatsapp } = build();
    await service.setDeliveryFee(ORDER_ID, { deliveryFee: 5000 }, owner);
    await flush();
    await flush();

    expect(whatsapp.sendTextMessage).toHaveBeenCalledTimes(1);
    const [, , to, text] = whatsapp.sendTextMessage.mock.calls[0];
    expect(to).toBe('573001112233');
    expect(text).toContain('🛵 *Domicilio de tu pedido #07:* $5.000 COP');
    expect(text).toContain('Productos: $20.000 COP');
    expect(text).toContain('*Total a pagar: $25.000 COP*');
    expect(text).toContain('Nequi 300 000 0000 · Bancolombia ahorros 123-456');
    expect(text).toContain('En cuanto verifiquemos tu pago o confirmación, tu pedido pasa a cocina');
    expect(whatsapp.recordBotMessage).toHaveBeenCalledWith('rest-1', '573001112233', text);
  });

  it('domicilio gratis ($0): "¡Gratis!" y total = productos', async () => {
    const { row, service, whatsapp } = build();
    await service.setDeliveryFee(ORDER_ID, { deliveryFee: 0 }, owner);
    await flush();
    await flush();
    expect(row).toMatchObject({ deliveryFee: 0, deliveryFeePending: false, total: 20000 });
    expect(whatsapp.sendTextMessage.mock.calls[0][3]).toContain('🛵 *Domicilio de tu pedido #07:* ¡Gratis! 🎉');
  });

  it('cambia la sede (multisede) y avisa a la cocina de la sede anterior que lo quite', async () => {
    const { row, prisma, gateway, service } = build();
    await service.setDeliveryFee(ORDER_ID, { deliveryFee: 4000, branchId: 'sede-2' }, owner);
    expect(prisma.branch.findFirst).toHaveBeenCalledWith({
      where: { id: 'sede-2', restaurantId: 'rest-1', isActive: true },
      select: { id: true },
    });
    expect(row.branchId).toBe('sede-2');
    expect(gateway.emitOrderLeftBranch).toHaveBeenCalledWith('rest-1', ORDER_ID, 'sede-1');
  });

  it('una sede ajena, inexistente o inactiva: 400 sin tocar el pedido', async () => {
    const { prisma, service } = build();
    await expect(service.setDeliveryFee(ORDER_ID, { deliveryFee: 4000, branchId: 'sede-x' }, owner)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('pago en línea (Wompi): el mensaje lleva el link por el total definitivo', async () => {
    const wompi = {
      isWompiEnabled: true,
      wompiPublicKey: 'pub_test_abc',
      wompiIntegritySecret: 'integ',
      wompiEventSecret: 'events',
    };
    const { service, whatsapp, prisma } = build({ paymentMethod: 'WOMPI' }, wompi);
    await service.setDeliveryFee(ORDER_ID, { deliveryFee: 6000 }, owner);
    await flush();
    await flush();
    const text: string = whatsapp.sendTextMessage.mock.calls[0][3];
    const url = new URL(/https:\/\/checkout\.wompi\.co\/p\/\S+/.exec(text)![0]);
    expect(url.searchParams.get('amount-in-cents')).toBe('2600000');
    expect(text).toContain('💳 Paga en línea aquí:');
    // Referencia nueva guardada en el pedido
    expect(prisma.order.update.mock.calls.at(-1)[0].data.paymentReference).toMatch(/^KOV-/);
  });

  it('solo domicilios, sin despachar/cancelar ni pagados; un cambio simultáneo responde 409', async () => {
    await expect(build({ orderType: 'TAKEAWAY' }).service.setDeliveryFee(ORDER_ID, { deliveryFee: 1 }, owner)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    for (const status of ['DELIVERED', 'CANCELLED']) {
      await expect(build({ status }).service.setDeliveryFee(ORDER_ID, { deliveryFee: 1 }, owner)).rejects.toBeInstanceOf(ConflictException);
    }
    await expect(build({ paymentStatus: 'PAID' }).service.setDeliveryFee(ORDER_ID, { deliveryFee: 1 }, owner)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(build().service.setDeliveryFee(ORDER_ID, { deliveryFee: 1 }, { role: Role.OWNER, restaurantId: 'rest-2' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    // Entre la lectura y el UPDATE llegó una adición por WhatsApp (el subtotal cambió)
    const { row, prisma, whatsapp, service } = build();
    prisma.order.findUnique.mockImplementationOnce(() => {
      const snapshot = { ...row };
      row.subtotal = 24000;
      return Promise.resolve(snapshot);
    });
    await expect(service.setDeliveryFee(ORDER_ID, { deliveryFee: 5000 }, owner)).rejects.toBeInstanceOf(ConflictException);
    await flush();
    expect(whatsapp.sendTextMessage).not.toHaveBeenCalled();
  });

  it('DTO: entero de 0 en adelante; sede como UUID', async () => {
    const errors = async (body: Record<string, unknown>) => (await validate(plainToInstance(SetDeliveryFeeDto, body))).map((e) => e.property);
    await expect(errors({ deliveryFee: 0 })).resolves.toEqual([]);
    await expect(errors({ deliveryFee: 5000, branchId: '0f8fad5b-d9cb-469f-a165-70867728950e' })).resolves.toEqual([]);
    await expect(errors({ deliveryFee: -1000 })).resolves.toEqual(['deliveryFee']);
    await expect(errors({ deliveryFee: 3500.5 })).resolves.toEqual(['deliveryFee']);
    await expect(errors({})).resolves.toEqual(['deliveryFee']);
    await expect(errors({ deliveryFee: 3000, branchId: 'sede-2' })).resolves.toEqual(['branchId']);
  });

  it('roles operativos: dueño y cocina; la cocina recibe la respuesta sin importes', async () => {
    const meta = (handler: unknown) => Reflect.getMetadata(KITCHEN_ACCESS_KEY, handler as object);
    expect(meta(OrdersController.prototype.setDeliveryFee)).toBe(true);
    expect(meta(OrdersController.prototype.deliveryFeeOptions)).toBe(true);

    const { service } = build();
    const controller = new OrdersController(service);
    const forKitchen = await controller.setDeliveryFee(kitchen as any, ORDER_ID, { deliveryFee: 5000 });
    expect(forKitchen).toMatchObject({ total: null, deliveryFee: null, deliveryFeePending: false, status: 'PENDING' });
  });
});

describe('Opciones de los botones rápidos (GET /orders/delivery-fee-options)', () => {
  const options = (stored: Record<string, unknown>) => {
    const { prisma, service } = build();
    prisma.restaurant.findUnique.mockResolvedValue({ branches: [{ id: 'sede-1', name: 'Principal', isMain: true }], ...stored });
    return { prisma, service };
  };

  it('sin configurar: los montos de siempre; con montos propios, limpios y ordenados', async () => {
    await expect(options({ deliveryFeePresets: null, flatDeliveryFee: null }).service.deliveryFeeOptions(owner)).resolves.toEqual({
      presets: [0, 3000, 4000, 5000, 6000, 8000],
      flatDeliveryFee: null,
      branches: [{ id: 'sede-1', name: 'Principal', isMain: true }],
    });
    const custom = options({ deliveryFeePresets: [7000, 2500, 2500, -1, 'x'], flatDeliveryFee: 5000 });
    await expect(custom.service.deliveryFeeOptions(kitchen)).resolves.toMatchObject({ presets: [2500, 7000], flatDeliveryFee: 5000 });
    expect(custom.prisma.restaurant.findUnique.mock.calls[0][0].where).toEqual({ id: 'rest-1' });
    expect(custom.prisma.restaurant.findUnique.mock.calls[0][0].select.branches.where).toEqual({ isActive: true });
  });

  it('otro restaurante: 403', async () => {
    await expect(options({}).service.deliveryFeeOptions(kitchen, 'rest-2')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Reglas del domicilio manual', () => {
  it('con tarifa fija se cobra sola; sin ella nace en $0 pendiente; recoger y mesa no llevan domicilio', () => {
    expect(initialDeliveryFee('DELIVERY', { flatDeliveryFee: null })).toEqual({ deliveryFee: 0, deliveryFeePending: true });
    expect(initialDeliveryFee(undefined, {})).toEqual({ deliveryFee: 0, deliveryFeePending: true });
    expect(initialDeliveryFee('DELIVERY', { flatDeliveryFee: 5000 })).toEqual({ deliveryFee: 5000, deliveryFeePending: false });
    expect(initialDeliveryFee('DELIVERY', { flatDeliveryFee: 0 })).toEqual({ deliveryFee: 0, deliveryFeePending: false });
    expect(initialDeliveryFee('TAKEAWAY', { flatDeliveryFee: 5000 })).toEqual({ deliveryFee: 0, deliveryFeePending: false });
    expect(initialDeliveryFee('DINE_IN', {})).toEqual({ deliveryFee: 0, deliveryFeePending: false });
  });

  it('montos: enteros, únicos, ordenados y máximo 10; vacíos o inválidos -> los de siempre', () => {
    expect(DEFAULT_DELIVERY_FEE_PRESETS).toEqual([0, 3000, 4000, 5000, 6000, 8000]);
    expect(cleanDeliveryFeePresets([5000, 0, 3000.4, 3000, -500, 2_000_000])).toEqual([0, 3000, 5000]);
    expect(cleanDeliveryFeePresets(Array.from({ length: 15 }, (_, i) => i * 1000))).toHaveLength(10);
    expect(resolveDeliveryFeePresets([])).toEqual(DEFAULT_DELIVERY_FEE_PRESETS);
    expect(resolveDeliveryFeePresets({ nope: true })).toEqual(DEFAULT_DELIVERY_FEE_PRESETS);
  });

  it('mensaje al cliente según cómo paga', () => {
    const base = { dailyNumber: 3, deliveryFee: 4000, subtotal: 20000, total: 24000 };
    expect(buildDeliveryFeeMessage({ ...base, paymentMethod: 'CASH', paymentDetails: null })).toContain('💵 Pagas en efectivo al recibir.');
    expect(buildDeliveryFeeMessage({ ...base, paymentMethod: 'CASH', paymentDetails: 'Nequi 300' })).toContain(
      '💵 Pagas en efectivo al recibir. Si prefieres transferir:\nNequi 300',
    );
    expect(buildDeliveryFeeMessage({ ...base, paymentMethod: 'TRANSFERENCIA', paymentDetails: '' })).toContain(
      'En un momento te compartimos los datos para la transferencia.',
    );
    expect(buildDeliveryFeeMessage({ ...base, paymentMethod: null, paymentDetails: 'Daviplata 311' })).toContain(
      '💳 *Medios de pago:*\nDaviplata 311\n\nEnvíanos la captura del comprobante por aquí.',
    );
  });
});

describe('Cocina de la sede anterior', () => {
  it('recibe "order_removed" en su sala cuando el pedido pasa a otra sede', () => {
    const gateway = Object.create(OrdersGateway.prototype) as OrdersGateway;
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    (gateway as any).server = { to };
    gateway.emitOrderLeftBranch('rest-1', ORDER_ID, 'sede-1');
    expect(to).toHaveBeenCalledWith('restaurant_rest-1_kitchen_sede-1');
    expect(emit).toHaveBeenCalledWith('order_removed', { id: ORDER_ID, restaurantId: 'rest-1' });
  });
});
