import { BadRequestException, ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OrdersService } from './orders.service';
import { businessDayStart } from './daily-number';

describe('Tablero activo del Kanban (GET /orders y PATCH /orders/:id/archive)', () => {
  const owner = { role: Role.OWNER, restaurantId: 'rest-1' };
  const at = (iso: string) => new Date(iso);
  // Jornada del 5 nov 2026 (Bogotá, UTC-5): empieza 10:00 UTC
  const rows = [
    { id: 'a', restaurantId: 'rest-1', createdAt: at('2026-11-05T11:00:00Z'), status: 'DELIVERED', archivedAt: at('2026-11-05T12:00:00Z') },
    { id: 'b', restaurantId: 'rest-1', createdAt: at('2026-11-05T13:00:00Z'), status: 'PREPARING', archivedAt: null },
  ];

  const build = (row: Record<string, unknown> = {}) => {
    const stored = { id: 'o1', restaurantId: 'rest-1', createdAt: new Date(), status: 'DELIVERED', archivedAt: null, items: [], ...row };
    const prisma: any = {
      order: {
        findMany: jest.fn().mockResolvedValue(rows),
        findUnique: jest.fn().mockResolvedValue(stored),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...stored, ...data, restaurant: { name: 'Betania' } })),
      },
    };
    const gateway: any = { emitOrderUpdated: jest.fn() };
    return { prisma, gateway, service: new OrdersService(prisma, gateway, {} as any, {} as any, {} as any, {} as any) };
  };

  beforeEach(() => jest.useFakeTimers({ now: at('2026-11-05T15:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] }));
  afterEach(() => jest.useRealTimers());

  it('por defecto: solo la jornada en curso (desde las 5:00) y sin archivados, con el turno intacto', async () => {
    const { prisma, service } = build();
    const result = await service.findAll(owner, 'rest-1');

    expect(prisma.order.findMany.mock.calls[0][0].where).toEqual({
      restaurantId: 'rest-1',
      createdAt: { gte: businessDayStart(new Date()) },
    });
    expect(businessDayStart(new Date()).toISOString()).toBe('2026-11-05T10:00:00.000Z');
    // El archivado cuenta para la numeración: el siguiente sigue siendo el #02
    expect(result).toEqual([expect.objectContaining({ id: 'b', dailyNumber: 2 })]);
  });

  it('scope=all: todo el historial (KPIs) incluidos archivados; un scope desconocido es 400', async () => {
    const { prisma, service } = build();
    const result = await service.findAll(owner, 'rest-1', 'all');
    expect(prisma.order.findMany.mock.calls[0][0].where).toEqual({ restaurantId: 'rest-1' });
    expect(result.map((o) => o.id)).toEqual(['a', 'b']);
    await expect(service.findAll(owner, 'rest-1', 'yesterday')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('archivar: marca archivedAt (no borra) y avisa al Kanban', async () => {
    const { prisma, gateway, service } = build();
    const result = await service.archive('o1', owner);
    expect(prisma.order.update.mock.calls[0][0].data).toEqual({ archivedAt: new Date() });
    expect(result.archivedAt).toEqual(new Date());
    expect(gateway.emitOrderUpdated).toHaveBeenCalledWith('rest-1', expect.objectContaining({ id: 'o1', archivedAt: new Date() }));
    expect(prisma.order.delete).toBeUndefined();
  });

  it('solo se archivan pedidos despachados o cancelados; repetir no vuelve a escribir', async () => {
    await expect(build({ status: 'PREPARING' }).service.archive('o1', owner)).rejects.toBeInstanceOf(ConflictException);
    const cancelled = build({ status: 'CANCELLED' });
    await expect(cancelled.service.archive('o1', owner)).resolves.toBeTruthy();
    const archived = build({ archivedAt: at('2026-11-05T14:00:00Z') });
    await archived.service.archive('o1', owner);
    expect(archived.prisma.order.update).not.toHaveBeenCalled();
  });
});
