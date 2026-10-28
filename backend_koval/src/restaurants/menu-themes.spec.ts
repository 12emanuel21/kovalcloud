import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RestaurantsService } from './restaurants.service';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { MENU_LAYOUTS, MENU_THEMES, resolveMenuColorMode, resolveMenuLayout, resolveMenuTheme } from './menu-themes';
import type { AiService } from '../ai/ai.service';
import type { SudoCredentials } from '../auth/two-factor-auth.service';

describe('Temas visuales de la carta pública', () => {
  it('PATCH /restaurants/:id acepta los 4 temas y rechaza cualquier otro', async () => {
    for (const theme of MENU_THEMES) {
      expect(await validate(plainToInstance(UpdateRestaurantDto, { theme }))).toHaveLength(0);
    }
    for (const theme of ['dark-premium', 'neon', 42]) {
      const errors = await validate(plainToInstance(UpdateRestaurantDto, { theme }));
      expect(errors.map((e) => e.property)).toEqual(['theme']);
    }
  });

  it('"Guardar Identidad" envía el tema y se guarda en el restaurante', async () => {
    const prisma: any = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'rest-1' }),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'rest-1', users: [], ...data })),
      },
    };
    const service = new RestaurantsService(prisma, {} as AiService, { assertSudo: jest.fn() } as any);
    await service.update('rest-1', { theme: 'sushi-dark' }, {} as SudoCredentials);
    expect(prisma.restaurant.update.mock.calls[0][0].data.theme).toBe('sushi-dark');
  });

  it('resolveMenuTheme: equivalencias de la primera versión y street-burger por defecto', () => {
    expect(resolveMenuTheme('bistro-grill')).toBe('bistro-grill');
    expect(resolveMenuTheme('dark-premium')).toBe('street-burger');
    expect(resolveMenuTheme('clean-light')).toBe('cafe-bakery');
    expect(resolveMenuTheme(null)).toBe('street-burger');
    expect(resolveMenuTheme(undefined)).toBe('street-burger');
    expect(resolveMenuTheme('desconocido')).toBe('street-burger');
  });

  it('GET /restaurants/slug/:slug siempre responde un tema válido', async () => {
    const prisma: any = { restaurant: { findUnique: jest.fn() } };
    const service = new RestaurantsService(prisma, {} as AiService, {} as any);
    for (const [stored, expected] of [
      ['cafe-bakery', 'cafe-bakery'],
      [null, 'street-burger'],
      ['clean-light', 'cafe-bakery'],
    ] as const) {
      prisma.restaurant.findUnique.mockResolvedValue({ id: 'rest-1', slug: 'demo', theme: stored, categories: [] });
      await expect(service.findBySlug('demo')).resolves.toMatchObject({ theme: expected });
    }
  });
});

describe('Modo claro / oscuro con el que abre la carta', () => {
  it('PATCH /restaurants/:id acepta light y dark y rechaza otros valores', async () => {
    for (const menuColorMode of ['light', 'dark']) {
      expect(await validate(plainToInstance(UpdateRestaurantDto, { menuColorMode }))).toHaveLength(0);
    }
    const errors = await validate(plainToInstance(UpdateRestaurantDto, { menuColorMode: 'system' }));
    expect(errors.map((e) => e.property)).toEqual(['menuColorMode']);
  });

  it('se guarda con "Guardar identidad"', async () => {
    const prisma: any = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'rest-1' }),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'rest-1', users: [], ...data })),
      },
    };
    const service = new RestaurantsService(prisma, {} as AiService, { assertSudo: jest.fn() } as any);
    await service.update('rest-1', { theme: 'street-burger', menuColorMode: 'light' }, {} as SudoCredentials);
    expect(prisma.restaurant.update.mock.calls[0][0].data).toMatchObject({ menuColorMode: 'light' });
  });

  it('la carta pública recibe el modo del dueño o, si falta, el natural del tema', async () => {
    expect(resolveMenuColorMode('light', 'street-burger')).toBe('light');
    expect(resolveMenuColorMode(null, 'cafe-bakery')).toBe('light');
    expect(resolveMenuColorMode(undefined, 'sushi-dark')).toBe('dark');
    expect(resolveMenuColorMode('raro', 'clean-light')).toBe('light');

    const prisma: any = {
      restaurant: { findUnique: jest.fn().mockResolvedValue({ id: 'r', slug: 'demo', theme: 'bistro-grill', menuColorMode: 'light', categories: [] }) },
    };
    const service = new RestaurantsService(prisma, {} as AiService, {} as any);
    await expect(service.findBySlug('demo')).resolves.toMatchObject({ theme: 'bistro-grill', menuColorMode: 'light' });
  });
});

describe('Estructura del menú (layout)', () => {
  it('PATCH /restaurants/:id acepta visual-grid y compact-row y rechaza otras', async () => {
    for (const layout of MENU_LAYOUTS) {
      expect(await validate(plainToInstance(UpdateRestaurantDto, { layout }))).toHaveLength(0);
    }
    const errors = await validate(plainToInstance(UpdateRestaurantDto, { layout: 'masonry' }));
    expect(errors.map((e) => e.property)).toEqual(['layout']);
  });

  it('se guarda con "Guardar identidad" y la carta pública lo recibe con fallback a visual-grid', async () => {
    const prisma: any = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'rest-1' }),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'rest-1', users: [], ...data })),
      },
    };
    const service = new RestaurantsService(prisma, {} as AiService, { assertSudo: jest.fn() } as any);
    await service.update('rest-1', { layout: 'compact-row' }, {} as SudoCredentials);
    expect(prisma.restaurant.update.mock.calls[0][0].data.layout).toBe('compact-row');

    expect(resolveMenuLayout(null)).toBe('visual-grid');
    expect(resolveMenuLayout('otra')).toBe('visual-grid');
    for (const [stored, expected] of [['compact-row', 'compact-row'], [null, 'visual-grid']] as const) {
      prisma.restaurant.findUnique.mockResolvedValue({ id: 'r', slug: 'demo', layout: stored, categories: [] });
      await expect(service.findBySlug('demo')).resolves.toMatchObject({ layout: expected });
    }
  });
});
