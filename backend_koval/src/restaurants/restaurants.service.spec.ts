import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateRestaurantConfigDto } from './dto/update-restaurant-config.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Test, TestingModule } from '@nestjs/testing';
import { RestaurantsService } from './restaurants.service';
import { AiService } from '../ai/ai.service';
import { TwoFactorAuthService, sudoRequired, type SudoCredentials } from '../auth/two-factor-auth.service';

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
        { provide: TwoFactorAuthService, useValue: { assertSudo: jest.fn() } },
        RestaurantsService,
      ],
    }).compile();

    service = module.get<RestaurantsService>(RestaurantsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

const sudo = { user: { id: 'user-1', isTwoFactorEnabled: true } } as unknown as SudoCredentials;

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
    const twoFactorAuth = { assertSudo: jest.fn().mockResolvedValue(undefined) };
    return { prisma, twoFactorAuth, service: new RestaurantsService(prisma, {} as AiService, twoFactorAuth as any) };
  };

  it('activar el cierre de emergencia borra cualquier prórroga activa', async () => {
    const { prisma, service } = build(restaurantRow({ extendedUntil: new Date(Date.now() + 3600_000) }));
    await service.updateConfig('rest-1', { isTemporarilyClosed: true }, sudo);
    expect(prisma.restaurant.update.mock.calls[0][0].data).toMatchObject({ isTemporarilyClosed: true, extendedUntil: null });
  });

  it('guarda el tema de la carta y el DTO rechaza temas desconocidos', async () => {
    const { prisma, service } = build(restaurantRow());
    await service.updateConfig('rest-1', { theme: 'clean-light' }, sudo);
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
    }, sudo);

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
    await service.updateConfig('rest-1', { isTemporarilyClosed: false, address: 'Calle 1' }, sudo);
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

describe('RestaurantsService · Sudo Mode solo para campos sensibles', () => {
  const stored = {
    id: 'rest-1',
    wompiPublicKey: 'pub_test_guardada',
    wompiPrivateKey: 'prv_test_guardada',
    wompiEventSecret: null,
    wompiIntegritySecret: null,
    whatsappToken: 'EAAG-guardado',
    whatsappPhoneId: '123',
    whatsappWabaId: null,
    whatsappVerifyToken: null,
    metaAppSecret: 'app-secret',
  };

  const build = () => {
    const prisma: any = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue(stored),
        update: jest.fn().mockImplementation(({ data }) => ({ ...stored, ...data, users: [], plan: null })),
      },
    };
    const twoFactorAuth = { assertSudo: jest.fn().mockRejectedValue(sudoRequired('MISSING')) };
    return { prisma, twoFactorAuth, service: new RestaurantsService(prisma, {} as AiService, twoFactorAuth as any) };
  };

  it('tema, horarios y cierre de emergencia se guardan sin pedir Sudo Mode', async () => {
    const { prisma, twoFactorAuth, service } = build();
    await service.updateConfig(
      'rest-1',
      {
        theme: 'clean-light',
        isTemporarilyClosed: true,
        closedMessage: 'Volvemos pronto',
        // El formulario reenvía la llave pública guardada y deja vacíos los secretos
        wompiPublicKey: 'pub_test_guardada',
        wompiPrivateKey: '',
        wompiEventSecret: '',
      },
      sudo,
    );
    expect(twoFactorAuth.assertSudo).not.toHaveBeenCalled();
    expect(prisma.restaurant.update).toHaveBeenCalled();
  });

  it('cambiar o borrar una llave de Wompi exige Sudo Mode y no guarda nada sin él', async () => {
    for (const dto of [{ wompiPublicKey: 'pub_prod_nueva' }, { wompiPrivateKey: 'prv_prod_nueva' }, { wompiPrivateKey: null }]) {
      const { prisma, twoFactorAuth, service } = build();
      await expect(service.updateConfig('rest-1', dto, sudo)).rejects.toMatchObject({ response: { message: 'SUDO_REQUIRED' } });
      expect(twoFactorAuth.assertSudo).toHaveBeenCalledWith(sudo);
      expect(prisma.restaurant.update).not.toHaveBeenCalled();
    }
  });

  it('con Sudo Mode vigente guarda las llaves nuevas', async () => {
    const { prisma, twoFactorAuth, service } = build();
    twoFactorAuth.assertSudo.mockResolvedValue(undefined);
    await service.updateConfig('rest-1', { wompiIntegritySecret: 'test_integrity_nuevo' }, sudo);
    expect(prisma.restaurant.update.mock.calls[0][0].data.wompiIntegritySecret).toBe('test_integrity_nuevo');
  });

  it('interruptor de Wompi: apagarlo no pide Sudo Mode; encenderlo exige llaves completas', async () => {
    const off = build();
    await off.service.updateConfig('rest-1', { isWompiEnabled: false }, sudo);
    expect(off.twoFactorAuth.assertSudo).not.toHaveBeenCalled();
    expect(off.prisma.restaurant.update.mock.calls[0][0].data.isWompiEnabled).toBe(false);

    // stored no tiene secreto de eventos ni de integridad
    const on = build();
    await expect(on.service.updateConfig('rest-1', { isWompiEnabled: true }, sudo)).rejects.toBeInstanceOf(BadRequestException);
    expect(on.prisma.restaurant.update).not.toHaveBeenCalled();
  });

  it('PATCH /restaurants/:id: la identidad se guarda libre; las credenciales de Meta exigen Sudo Mode', async () => {
    const free = build();
    await free.service.update('rest-1', { name: 'Nuevo nombre', whatsappToken: 'EAAG-guardado', metaAppSecret: '' }, sudo);
    expect(free.twoFactorAuth.assertSudo).not.toHaveBeenCalled();

    for (const dto of [{ whatsappToken: 'EAAG-atacante' }, { whatsappPhoneId: '999' }, { metaAppSecret: 'otro' }]) {
      const { prisma, service } = build();
      await expect(service.update('rest-1', dto, sudo)).rejects.toMatchObject({ response: { message: 'SUDO_REQUIRED' } });
      expect(prisma.restaurant.update).not.toHaveBeenCalled();
    }
  });
});
