import { ConflictException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { WompiCheckoutService } from '../payments/wompi-checkout.service';

describe('OrdersService.create · platos no disponibles', () => {
  const build = (availableIds: string[]) => {
    const prisma: any = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'rest-1', isTemporarilyClosed: false, businessHours: null, extendedUntil: null }),
      },
      menuItem: { findMany: jest.fn().mockResolvedValue(availableIds.map((id) => ({ id, price: 10000 }))) },
      $transaction: jest.fn(),
    };
    const service = new OrdersService(prisma, { emitNewOrder: jest.fn() } as any, {} as any, new WompiCheckoutService(prisma), {} as any, {} as any);
    return { prisma, service };
  };

  const dto = (ids: string[]) =>
    ({
      restaurantId: 'rest-1',
      customerName: 'Ana',
      customerPhone: '3001112233',
      items: ids.map((menuItemId) => ({ menuItemId, quantity: 1 })),
    }) as any;

  it('responde 409 ITEMS_UNAVAILABLE con solo los IDs agotados/borrados/ajenos y no crea el pedido', async () => {
    const { prisma, service } = build(['ok-1']);
    const error = await service.create(dto(['ok-1', 'agotado', 'borrado', 'agotado'])).catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({ statusCode: 409, code: 'ITEMS_UNAVAILABLE', unavailableItemIds: ['agotado', 'borrado'] }),
    );
    // La consulta solo acepta platos del restaurante, disponibles y no borrados
    expect(prisma.menuItem.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['ok-1', 'agotado', 'borrado', 'agotado'] }, restaurantId: 'rest-1', isAvailable: true, deletedAt: null },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
