import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import { UpdateRestaurantConfigDto } from './dto/update-restaurant-config.dto';
import { publicWhatsAppNumber, syncWhatsAppBotNumber, toBotNumber } from './whatsapp-bot-number';
import { WhatsappSessionSyncController } from '../whatsapp-gateway/whatsapp-session-sync.controller';
import type { AiService } from '../ai/ai.service';
import type { SudoCredentials } from '../auth/two-factor-auth.service';

describe('toBotNumber (línea real del bot)', () => {
  it('limpia el JID de Baileys (dispositivo y dominio) y el display_phone_number de Meta', () => {
    expect(toBotNumber('573001234567:12@s.whatsapp.net')).toBe('573001234567');
    expect(toBotNumber('573001234567@s.whatsapp.net')).toBe('573001234567');
    expect(toBotNumber('+57 300 123 4567')).toBe('573001234567');
    expect(toBotNumber('15551234567')).toBe('15551234567');
  });

  it('descarta valores que no son un número completo', () => {
    expect(toBotNumber(null)).toBeNull();
    expect(toBotNumber('')).toBeNull();
    expect(toBotNumber('3001234')).toBeNull();
    expect(toBotNumber('abc@lid')).toBeNull();
  });
});

describe('publicWhatsAppNumber (prioridad de la carta pública)', () => {
  it('1) la SIM / línea conectada al bot gana sobre el teléfono del local', () => {
    expect(publicWhatsAppNumber({ whatsappBotNumber: '573109998877', phone: '3001234567' })).toBe('573109998877');
  });

  it('2) sin sesión vinculada, el teléfono del local normalizado con indicativo 57', () => {
    expect(publicWhatsAppNumber({ whatsappBotNumber: null, phone: '300 123 4567' })).toBe('573001234567');
  });

  it('3) sin ninguno, null (la carta oculta el botón)', () => {
    expect(publicWhatsAppNumber({ whatsappBotNumber: null, phone: null })).toBeNull();
    expect(publicWhatsAppNumber({ whatsappBotNumber: 'basura', phone: '123' })).toBeNull();
  });

  it('GET /restaurants/slug/:slug responde whatsappNumber con esa prioridad', async () => {
    const restaurant = { id: 'rest-1', slug: 'burger-bq', phone: '3001234567', whatsappBotNumber: '573109998877', categories: [] };
    const prisma: any = { restaurant: { findUnique: jest.fn().mockResolvedValue(restaurant) } };
    const service = new RestaurantsService(prisma, {} as AiService, {} as any);
    await expect(service.findBySlug('burger-bq')).resolves.toMatchObject({ whatsappNumber: '573109998877' });

    prisma.restaurant.findUnique.mockResolvedValue({ ...restaurant, whatsappBotNumber: null });
    await expect(service.findBySlug('burger-bq')).resolves.toMatchObject({ whatsappNumber: '573001234567' });
  });
});

describe('syncWhatsAppBotNumber', () => {
  const build = (stored: string | null) => ({
    restaurant: {
      findUnique: jest.fn().mockResolvedValue({ whatsappBotNumber: stored }),
      update: jest.fn().mockResolvedValue({}),
    },
  });

  it('guarda la SIM conectada y no reescribe si es la misma', async () => {
    const prisma: any = build(null);
    await expect(syncWhatsAppBotNumber(prisma, 'rest-1', '573001234567:3@s.whatsapp.net')).resolves.toBe(true);
    expect(prisma.restaurant.update).toHaveBeenCalledWith({ where: { id: 'rest-1' }, data: { whatsappBotNumber: '573001234567' } });

    const same: any = build('573001234567');
    await expect(syncWhatsAppBotNumber(same, 'rest-1', '573001234567')).resolves.toBe(false);
    expect(same.restaurant.update).not.toHaveBeenCalled();
  });

  it('null desvincula; un número inválido no borra el guardado', async () => {
    const prisma: any = build('573001234567');
    await expect(syncWhatsAppBotNumber(prisma, 'rest-1', null)).resolves.toBe(true);
    expect(prisma.restaurant.update).toHaveBeenCalledWith({ where: { id: 'rest-1' }, data: { whatsappBotNumber: null } });

    const invalid: any = build('573001234567');
    await expect(syncWhatsAppBotNumber(invalid, 'rest-1', '12')).resolves.toBe(false);
    expect(invalid.restaurant.update).not.toHaveBeenCalled();
  });

  it('restaurante inexistente o error de BD: no lanza', async () => {
    const missing: any = { restaurant: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() } };
    await expect(syncWhatsAppBotNumber(missing, 'nope', '573001234567')).resolves.toBe(false);
    expect(missing.restaurant.update).not.toHaveBeenCalled();

    const broken: any = { restaurant: { findUnique: jest.fn().mockRejectedValue(new Error('db caída')) } };
    await expect(syncWhatsAppBotNumber(broken, 'rest-1', '573001234567')).resolves.toBe(false);
  });
});

describe('POST /internal/whatsapp/session (aviso del microservicio Baileys)', () => {
  const OLD_KEY = process.env.INTERNAL_API_KEY;
  beforeAll(() => (process.env.INTERNAL_API_KEY = 'clave-interna'));
  afterAll(() => (process.env.INTERNAL_API_KEY = OLD_KEY));

  const build = () => {
    const prisma: any = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({ whatsappBotNumber: null }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    return { prisma, controller: new WhatsappSessionSyncController(prisma) };
  };

  it('sin la clave interna responde 401 y no toca la BD', async () => {
    const { prisma, controller } = build();
    for (const key of [undefined, 'otra-clave']) {
      await expect(
        controller.syncSession(key, { restaurantId: 'rest-1', phoneNumber: '573001234567' }),
      ).rejects.toThrow(UnauthorizedException);
    }
    expect(prisma.restaurant.update).not.toHaveBeenCalled();
  });

  it('con la clave interna guarda el número de la SIM', async () => {
    const { prisma, controller } = build();
    await expect(
      controller.syncSession('clave-interna', { restaurantId: 'rest-1', phoneNumber: '573001234567' }),
    ).resolves.toEqual({ success: true, updated: true });
    expect(prisma.restaurant.update).toHaveBeenCalledWith({ where: { id: 'rest-1' }, data: { whatsappBotNumber: '573001234567' } });
  });
});

describe('Ajustes > Pagos: "Otros medios de pago / Nequi" no pisa el teléfono del local', () => {
  const sudo = { user: { id: 'user-1', isTwoFactorEnabled: true } } as unknown as SudoCredentials;

  it('PATCH /config descarta phone y whatsappBotNumber (whitelist) y guarda la nota de Nequi aparte', async () => {
    const pipe = new ValidationPipe({ whitelist: true });
    const dto = await pipe.transform(
      { paymentDetails: 'Nequi: 3109998877 - A nombre de Carlos', phone: '3109998877', whatsappBotNumber: '573109998877' },
      { type: 'body', metatype: UpdateRestaurantConfigDto },
    );
    expect(dto).not.toHaveProperty('phone');
    expect(dto).not.toHaveProperty('whatsappBotNumber');

    const prisma: any = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'rest-1', isWompiEnabled: false }),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'rest-1', isWompiEnabled: false, ...data })),
      },
    };
    const service = new RestaurantsService(prisma, {} as AiService, { assertSudo: jest.fn() } as any);
    await service.updateConfig('rest-1', { ...dto, phone: '3109998877' } as any, sudo);
    const data = prisma.restaurant.update.mock.calls[0][0].data;
    expect(data.paymentDetails).toBe('Nequi: 3109998877 - A nombre de Carlos');
    expect(data).not.toHaveProperty('phone');
    expect(data).not.toHaveProperty('whatsappBotNumber');
  });
});
