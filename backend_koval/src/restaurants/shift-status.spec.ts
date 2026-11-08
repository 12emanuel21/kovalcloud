import { NotFoundException } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import type { AiService } from '../ai/ai.service';

/** Horario que nunca está abierto: solo la prórroga abre el local */
const NEVER_OPEN = { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };

describe('RestaurantsService · estado de apertura y fin del tiempo extra', () => {
  const build = (row: Record<string, unknown> | null) => {
    const prisma: any = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockImplementation(({ data, select }) => ({ id: 'rest-1', ...data, _select: select })),
      },
    };
    return { prisma, service: new RestaurantsService(prisma, {} as AiService, { assertSudo: jest.fn() } as any) };
  };
  const base = { id: 'rest-1', name: 'Local', users: [], plan: null, isTemporarilyClosed: false, closedMessage: null, businessHours: NEVER_OPEN };

  it('GET status: con prórroga vigente está abierto; solo expone los campos de apertura', async () => {
    const { prisma, service } = build({ ...base, extendedUntil: new Date(Date.now() + 30 * 60_000) });
    const status = await service.findStatusBySlug('demo');
    expect(status.isOpen).toBe(true);
    expect(prisma.restaurant.findUnique).toHaveBeenCalledWith({
      where: { slug: 'demo' },
      select: { isTemporarilyClosed: true, closedMessage: true, businessHours: true, extendedUntil: true },
    });
  });

  it('GET status: sin prórroga y fuera de horario está cerrado; con emergencia, cerrado aunque haya prórroga', async () => {
    expect((await build({ ...base, extendedUntil: null }).service.findStatusBySlug('demo')).isOpen).toBe(false);
    const emergency = { ...base, isTemporarilyClosed: true, extendedUntil: new Date(Date.now() + 60 * 60_000) };
    expect((await build(emergency).service.findStatusBySlug('demo')).isOpen).toBe(false);
  });

  it('GET status: slug inexistente responde 404', async () => {
    await expect(build(null).service.findStatusBySlug('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('Cerrar ahora: extend-hours con null deja extendedUntil en null (también con emergencia activa)', async () => {
    const { prisma, service } = build({ ...base, isTemporarilyClosed: true, extendedUntil: new Date(Date.now() + 60_000) });
    const result = await service.extendHours('rest-1', null);
    expect(prisma.restaurant.update.mock.calls[0][0].data).toEqual({ extendedUntil: null });
    expect(result.extendedUntil).toBeNull();
  });
});
