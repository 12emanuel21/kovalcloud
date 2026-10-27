import { BadRequestException } from '@nestjs/common';
import { OrdersService, buildPaymentLinkMessage } from './orders.service';
import { WompiCheckoutService } from '../payments/wompi-checkout.service';
import { RestaurantsService } from '../restaurants/restaurants.service';

const wompiRestaurant = {
  id: 'rest-1',
  name: 'Burger BQ',
  slug: 'burger-bq',
  isTemporarilyClosed: false,
  businessHours: null,
  extendedUntil: null,
  whatsappToken: null,
  whatsappPhoneId: null,
  wompiPublicKey: 'pub_test_abc',
  wompiPrivateKey: 'prv_test_secret',
  wompiEventSecret: 'test_events_secret',
  wompiIntegritySecret: 'test_integrity_secret',
  isWompiEnabled: true,
};

describe('OrdersService.create · pago en línea', () => {
  const build = (restaurant: Record<string, unknown> = wompiRestaurant) => {
    const prisma: any = {
      restaurant: { findUnique: jest.fn().mockResolvedValue(restaurant) },
      menuItem: { findMany: jest.fn().mockResolvedValue([{ id: 'item-1', price: 12500 }]) },
      order: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation((fn) =>
        fn({
          order: {
            create: jest.fn().mockImplementation(({ data }) =>
              Promise.resolve({ id: '0f8fad5b-d9cb-469f-a165-70867728950e', paymentReference: null, paymentStatus: 'PENDING', ...data }),
            ),
          },
        }),
      ),
    };
    const gateway: any = { emitNewOrder: jest.fn() };
    const whatsapp: any = { sendTextMessage: jest.fn().mockResolvedValue({}) };
    const service = new OrdersService(prisma, gateway, whatsapp, new WompiCheckoutService(prisma));
    const notify = jest.spyOn(service, 'notifyCustomer').mockResolvedValue(undefined);
    return { prisma, gateway, service, notify };
  };

  const dto = (paymentMethod?: 'WOMPI' | 'CASH') =>
    ({
      restaurantId: 'rest-1',
      customerName: 'Ana',
      customerPhone: '573001112233',
      items: [{ menuItemId: 'item-1', quantity: 2 }],
      paymentMethod,
    }) as any;

  it('WOMPI: guarda el método, asigna referencia, devuelve wompiCheckoutUrl y manda el link por WhatsApp', async () => {
    const { prisma, gateway, service, notify } = build();

    const order = await service.create(dto('WOMPI'));

    expect(order.paymentMethod).toBe('WOMPI');
    expect(order.paymentReference).toMatch(/^KOV-0F8FAD5B-/);
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: order.id },
      data: { paymentReference: order.paymentReference },
    });
    const url = new URL(order.wompiCheckoutUrl!);
    expect(url.searchParams.get('amount-in-cents')).toBe('2500000');
    expect(url.searchParams.get('reference')).toBe(order.paymentReference);

    // El Kanban recibe el pedido ya con referencia (etiqueta "PAGO PENDIENTE" ámbar)
    expect(gateway.emitNewOrder.mock.calls[0][1].paymentReference).toBe(order.paymentReference);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ customerPhone: '573001112233', restaurantId: 'rest-1' }),
      buildPaymentLinkMessage('Burger BQ', order.id, 25000, order.wompiCheckoutUrl!),
    );
  });

  it('guarda el teléfono en formato internacional y el plan B de WhatsApp va a ese número', async () => {
    const { prisma, service, notify } = build();
    const order = await service.create({ ...dto('WOMPI'), customerPhone: '300 111-2233' });

    expect(order.customerPhone).toBe('573001112233');
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ customerPhone: '573001112233' }), expect.any(String));
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('notifyCustomer normaliza teléfonos guardados antes del cambio (pedidos viejos)', async () => {
    const { service, notify } = build();
    notify.mockRestore();
    const whatsapp = (service as any).metaWhatsAppService;
    await service.notifyCustomer({ customerPhone: '300 111 2233', restaurantId: 'rest-1', restaurant: {} }, 'hola');
    expect(whatsapp.sendTextMessage).toHaveBeenCalledWith('rest-1', '', '573001112233', 'hola', true);
  });

  it('CASH (o sin método): sin link de pago ni WhatsApp extra', async () => {
    const { service, notify } = build();
    for (const method of ['CASH', undefined] as const) {
      const order = await service.create(dto(method));
      expect(order.paymentMethod).toBe('CASH');
      expect(order.wompiCheckoutUrl).toBeNull();
    }
    expect(notify).not.toHaveBeenCalled();
  });

  it('WOMPI sin llaves completas: 400 antes de crear el pedido', async () => {
    const { prisma, service } = build({ ...wompiRestaurant, wompiEventSecret: null });
    await expect(service.create(dto('WOMPI'))).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('WOMPI con la pasarela apagada por el dueño: 400 aunque las llaves estén completas', async () => {
    const { prisma, service, notify } = build({ ...wompiRestaurant, isWompiEnabled: false });
    const error = await service.create(dto('WOMPI')).catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toMatch(/desactivado/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('si el link de Wompi falla, el WhatsApp solo confirma la recepción (sin link)', async () => {
    const { service, notify } = build({ ...wompiRestaurant, wompiIntegritySecret: 'x' });
    jest.spyOn(WompiCheckoutService.prototype, 'generatePaymentLink').mockRejectedValueOnce(new Error('caído'));
    jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
    const order = await service.create(dto('WOMPI'));
    expect(order.wompiCheckoutUrl).toBeNull();
    const message: string = notify.mock.calls[0][1];
    expect(message).toContain('Recibimos tu pedido');
    expect(message).not.toMatch(/https?:\/\//);
  });

  it('sin link, el mensaje solo confirma la recepción del pedido', () => {
    expect(buildPaymentLinkMessage('Burger BQ', 'abcd1234-xyz', 25000, null)).toBe(
      '🧾 ¡Recibimos tu pedido #ABCD1234 en Burger BQ! Total: $25.000 COP.\n\n' +
        'El local te confirmará el pedido por este chat.',
    );
  });

  it('el mensaje de WhatsApp incluye pedido, total y link', () => {
    expect(buildPaymentLinkMessage('Burger BQ', 'abcd1234-xyz', 25000, 'https://checkout.wompi.co/p/?x=1')).toBe(
      '🧾 ¡Recibimos tu pedido #ABCD1234 en Burger BQ! Total: $25.000 COP.\n\n' +
        '💳 Si no alcanzaste a pagar, puedes hacerlo aquí:\nhttps://checkout.wompi.co/p/?x=1\n\n' +
        'Apenas se confirme el pago te avisamos por este chat.',
    );
  });
});

describe('Carta pública (findBySlug) · Wompi', () => {
  it('expone solo la llave pública y onlinePaymentsEnabled, nunca los secretos', async () => {
    const prisma: any = { restaurant: { findUnique: jest.fn().mockResolvedValue({ ...wompiRestaurant, categories: [] }) } };
    const result: Record<string, unknown> = await new RestaurantsService(prisma, {} as any, {} as any).findBySlug('burger-bq');

    expect(result.wompiPublicKey).toBe('pub_test_abc');
    expect(result.onlinePaymentsEnabled).toBe(true);
    // wompiRestaurant no tiene teléfono: la carta no debe armar un wa.me/ sin número
    expect(result.whatsappNumber).toBeNull();
    for (const field of ['wompiPrivateKey', 'wompiEventSecret', 'wompiIntegritySecret']) {
      expect(result).not.toHaveProperty(field);
    }
    expect(JSON.stringify(result)).not.toMatch(/prv_test|test_events|test_integrity/);
  });

  it('con el interruptor apagado la carta recibe isWompiEnabled=false y no ofrece pagar en línea', async () => {
    const prisma: any = {
      restaurant: { findUnique: jest.fn().mockResolvedValue({ ...wompiRestaurant, isWompiEnabled: false, categories: [] }) },
    };
    const result: Record<string, unknown> = await new RestaurantsService(prisma, {} as any, {} as any).findBySlug('burger-bq');
    expect(result.isWompiEnabled).toBe(false);
    expect(result.onlinePaymentsEnabled).toBe(false);
  });
});
