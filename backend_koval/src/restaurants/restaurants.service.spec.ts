import { ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateRestaurantConfigDto } from './dto/update-restaurant-config.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Test, TestingModule } from '@nestjs/testing';
import { RestaurantsService } from './restaurants.service';
import { AiService } from '../ai/ai.service';

describe('RestaurantsService', () => {
  let service: RestaurantsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: PrismaService,
          useValue: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            $transaction: jest.fn(),
          },
        },
        // La importación de menús (PDF) usa la IA; en estos tests no se invoca
        { provide: AiService, useValue: { extractMenuFromPdf: jest.fn() } },
        RestaurantsService,
      ],
    }).compile();

    service = module.get<RestaurantsService>(RestaurantsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

describe('RestaurantsService · kill switch del cierre de emergencia', () => {
  const restaurantRow = (fields: Record<string, unknown> = {}) => ({
    id: 'rest-1',
    name: 'Local',
    users: [],
    plan: null,
    isTemporarilyClosed: false,
    ...fields,
  });

  const build = (row: Record<string, unknown>) => {
    const prisma: any = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'rest-1', ...data })),
      },
    };
    return { prisma, service: new RestaurantsService(prisma, {} as AiService) };
  };

  it('activar el cierre de emergencia borra cualquier prórroga activa', async () => {
    const { prisma, service } = build(restaurantRow({ extendedUntil: new Date(Date.now() + 3600_000) }));
    await service.updateConfig('rest-1', { isTemporarilyClosed: true });
    expect(prisma.restaurant.update.mock.calls[0][0].data).toMatchObject({ isTemporarilyClosed: true, extendedUntil: null });
  });

  it('guarda el tema de la carta y el DTO rechaza temas desconocidos', async () => {
    const { prisma, service } = build(restaurantRow());
    await service.updateConfig('rest-1', { theme: 'clean-light' });
    expect(prisma.restaurant.update.mock.calls[0][0].data).toMatchObject({ theme: 'clean-light' });

    const errors = await validate(plainToInstance(UpdateRestaurantConfigDto, { theme: 'neon' }));
    expect(errors.map((e) => e.property)).toEqual(['theme']);
  });

  it('desactivar la emergencia o editar otros campos no toca la prórroga', async () => {
    const { prisma, service } = build(restaurantRow());
    await service.updateConfig('rest-1', { isTemporarilyClosed: false, address: 'Calle 1' });
    expect(prisma.restaurant.update.mock.calls[0][0].data).not.toHaveProperty('extendedUntil');
  });

  it('no permite prorrogar con la emergencia activa (409), pero sí cancelar', async () => {
    const { prisma, service } = build(restaurantRow({ isTemporarilyClosed: true }));
    await expect(service.extendHours('rest-1', 30)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.restaurant.update).not.toHaveBeenCalled();

    await service.extendHours('rest-1', null);
    expect(prisma.restaurant.update.mock.calls[0][0].data).toEqual({ extendedUntil: null });
  });

  it('prorroga ahora + minutos cuando no hay emergencia', async () => {
    const { prisma, service } = build(restaurantRow());
    const before = Date.now();
    await service.extendHours('rest-1', 30);
    const until: Date = prisma.restaurant.update.mock.calls[0][0].data.extendedUntil;
    expect(until.getTime()).toBeGreaterThanOrEqual(before + 30 * 60_000);
    expect(until.getTime()).toBeLessThan(before + 31 * 60_000);
  });
});
