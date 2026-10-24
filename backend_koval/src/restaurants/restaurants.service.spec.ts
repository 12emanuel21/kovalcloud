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

  it('Wompi: guarda llaves nuevas, conserva las vacías, borra con null y nunca devuelve secretos completos', async () => {
    const { prisma, service } = build(restaurantRow());
    prisma.restaurant.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'rest-1',
      wompiPublicKey: data.wompiPublicKey ?? null,
      wompiPrivateKey: 'prv_test_guardada1234',
      wompiEventSecret: data.wompiEventSecret === null ? null : 'test_events_guardado9876',
      wompiIntegritySecret: data.wompiIntegritySecret ?? 'test_integrity_viejo0000',
    }));

    const result = await service.updateConfig('rest-1', {
      wompiPublicKey: ' pub_test_abc ',
      wompiPrivateKey: '',
      wompiEventSecret: null,
      wompiIntegritySecret: 'test_integrity_nuevo5555',
    });

    const data = prisma.restaurant.update.mock.calls[0][0].data;
    expect(data.wompiPublicKey).toBe('pub_test_abc');
    expect(data.wompiPrivateKey).toBeUndefined(); // "" = conservar
    expect(data.wompiEventSecret).toBeNull(); // null = borrar
    expect(data.wompiIntegritySecret).toBe('test_integrity_nuevo5555');

    expect(result).toMatchObject({
      wompiPublicKey: 'pub_test_abc',
      wompiEnvironment: 'sandbox',
      hasWompiPrivateKey: true,
      wompiPrivateKeyMasked: '••••1234',
      hasWompiEventSecret: false,
      wompiReady: false,
    });
    expect(JSON.stringify(result)).not.toContain('prv_test_guardada1234');
    expect(JSON.stringify(result)).not.toContain('test_integrity_nuevo5555');
  });

  it('el DTO rechaza llaves de Wompi pegadas en el campo equivocado', async () => {
    const errors = await validate(
      plainToInstance(UpdateRestaurantConfigDto, {
        wompiPublicKey: 'prv_test_x',
        wompiPrivateKey: 'pub_test_x',
        wompiEventSecret: 'test_integrity_x',
        wompiIntegritySecret: '',
      }),
    );
    expect(errors.map((e) => e.property).sort()).toEqual(['wompiEventSecret', 'wompiPrivateKey', 'wompiPublicKey']);
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
