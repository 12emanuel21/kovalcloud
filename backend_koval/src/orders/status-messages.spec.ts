import { OrdersService } from './orders.service';

describe('OrdersService.updateOrderStatus · aviso al cliente', () => {
  const build = (orderType: string) => {
    const row = { id: 'o1', restaurantId: 'rest-1', createdAt: new Date(), status: 'PREPARING', orderType, customerPhone: '573001112233', items: [] };
    const prisma: any = {
      order: {
        findUnique: jest.fn().mockResolvedValue(row),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...row, ...data, restaurant: { name: 'Betania' } })),
      },
    };
    const service = new OrdersService(prisma, { emitOrderStatusUpdated: jest.fn() } as any, {} as any, {} as any, {} as any, {} as any);
    const notify = jest.spyOn(service, 'notifyCustomer').mockResolvedValue(undefined);
    return { service, notify };
  };
  const owner = { role: 'OWNER', restaurantId: 'rest-1' } as any;

  it.each([
    ['DELIVERY', '✅ ¡Tu pedido está listo! Te avisamos por aquí cuando salga con el repartidor.'],
    ['TAKEAWAY', '✅ ¡Tu pedido está listo para recoger! Te esperamos.'],
    ['DINE_IN', '✅ ¡Tu pedido está listo! Disfruta tu comida.'],
  ])('DELIVERED sin despacho (%s) no dice "en camino": eso solo lo avisa el despacho', async (orderType, text) => {
    const { service, notify } = build(orderType);
    await service.updateOrderStatus('o1', 'DELIVERED', owner);
    expect(notify).toHaveBeenCalledWith(expect.anything(), text);
    expect(notify.mock.calls[0][1]).not.toContain('en camino');
  });
});
