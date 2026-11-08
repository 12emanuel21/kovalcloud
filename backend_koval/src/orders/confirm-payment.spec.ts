import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OrdersService } from './orders.service';
import { redactOrderFinancials } from './order-visibility';

describe('OrdersService.confirmManualPayment (POST /orders/:id/confirm-payment)', () => {
  const stored = { id: 'o1', restaurantId: 'rest-1', createdAt: new Date(), paymentStatus: 'PENDING', paymentMethod: null, status: 'PENDING', items: [] };
  const build = (row: Record<string, unknown> = stored) => {
    const prisma: any = {
      order: {
        findUnique: jest.fn().mockResolvedValue(row),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...row, ...data, restaurant: { name: 'Betania' } })),
      },
    };
    const gateway: any = { emitOrderUpdated: jest.fn() };
    const service = new OrdersService(prisma, gateway, {} as any, {} as any, {} as any, {} as any);
    const notify = jest.spyOn(service, 'notifyCustomer').mockResolvedValue(undefined);
    return { prisma, gateway, service, notify };
  };
  const owner = { role: Role.OWNER, restaurantId: 'rest-1' };

  it('marca PAGADO por transferencia, avisa al Kanban y confirma al cliente con su turno', async () => {
    const { prisma, gateway, service, notify } = build();
    const result = await service.confirmManualPayment('o1', owner);
    expect(prisma.order.update.mock.calls[0][0].data).toEqual({ paymentStatus: 'PAID', paymentMethod: 'TRANSFERENCIA' });
    expect(result.dailyNumber).toBe(1);
    expect(gateway.emitOrderUpdated).toHaveBeenCalledWith('rest-1', expect.objectContaining({ paymentStatus: 'PAID' }));
    expect(notify).toHaveBeenCalledWith(expect.anything(), '✅ ¡Confirmamos tu pago del pedido #01! Gracias 🙌');
  });

  it('conserva el método real (p. ej. NEQUI) y rechaza pedidos ya pagados, cancelados o de otro local', async () => {
    const nequi = build({ ...stored, paymentMethod: 'NEQUI' });
    await nequi.service.confirmManualPayment('o1', owner);
    expect(nequi.prisma.order.update.mock.calls[0][0].data).toEqual({ paymentStatus: 'PAID' });

    await expect(build({ ...stored, paymentStatus: 'PAID' }).service.confirmManualPayment('o1', owner)).rejects.toBeInstanceOf(ConflictException);
    await expect(build({ ...stored, status: 'CANCELLED' }).service.confirmManualPayment('o1', owner)).rejects.toBeInstanceOf(ConflictException);
    await expect(build().service.confirmManualPayment('o1', { role: Role.OWNER, restaurantId: 'rest-2' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('la cocina no ve el comprobante (dato financiero)', () => {
    expect(redactOrderFinancials({ id: 'o1', total: 1000, paymentProofUrl: 'x.jpg' })).toMatchObject({ total: null, paymentProofUrl: null });
  });
});
