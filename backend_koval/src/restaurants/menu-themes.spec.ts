import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RestaurantsService, newMenuItemIds } from './restaurants.service';
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
  it('PATCH /restaurants/:id acepta los 4 layouts y rechaza otros', async () => {
    expect(MENU_LAYOUTS).toEqual(['visual-grid', 'compact-row', 'bistro-classic', 'modern-tabs']);
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

describe('Marca propia: color de acento libre y tipografía', () => {
  const build = (row: Record<string, unknown> = {}, popular: unknown = []) => {
    const prisma: any = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'rest-1', slug: 'demo', categories: [], ...row }),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'rest-1', users: [], ...data })),
      },
      orderItem: { groupBy: typeof popular === 'function' ? popular : jest.fn().mockResolvedValue(popular) },
    };
    return { prisma, service: new RestaurantsService(prisma, {} as AiService, { assertSudo: jest.fn() } as any) };
  };

  it('PATCH valida #RRGGBB, las 4 tipografías y modern-tabs', async () => {
    const ok = await validate(
      plainToInstance(UpdateRestaurantDto, { customColor: '#E11D48', fontFamily: 'serif-elegant', layout: 'modern-tabs' }),
    );
    expect(ok).toHaveLength(0);
    expect(await validate(plainToInstance(UpdateRestaurantDto, { customColor: null }))).toHaveLength(0);
    for (const customColor of ['red', '#fff', '#12345g', 'e11d48']) {
      const errors = await validate(plainToInstance(UpdateRestaurantDto, { customColor }));
      expect(errors.map((e) => e.property)).toEqual(['customColor']);
    }
    const font = await validate(plainToInstance(UpdateRestaurantDto, { fontFamily: 'comic-sans' }));
    expect(font.map((e) => e.property)).toEqual(['fontFamily']);
  });

  it('guarda el color en minúsculas; null vuelve al del tema y undefined no lo toca', async () => {
    const { prisma, service } = build();
    await service.update('rest-1', { customColor: '#E11D48', fontFamily: 'warm-rounded' }, {} as SudoCredentials);
    expect(prisma.restaurant.update.mock.calls[0][0].data).toMatchObject({ customColor: '#e11d48', fontFamily: 'warm-rounded' });
    await service.update('rest-1', { customColor: null }, {} as SudoCredentials);
    expect(prisma.restaurant.update.mock.calls[1][0].data.customColor).toBeNull();
    await service.update('rest-1', { name: 'Otro' }, {} as SudoCredentials);
    expect(prisma.restaurant.update.mock.calls[2][0].data.customColor).toBeUndefined();
  });

  it('la carta pública recibe color, tipografía (con fallback) y los platos populares', async () => {
    const { service } = build(
      { customColor: '#E11D48', fontFamily: 'serif-elegant' },
      [
        { menuItemId: 'i1', _sum: { quantity: 12 } },
        { menuItemId: 'i2', _sum: { quantity: 3 } },
        { menuItemId: 'i3', _sum: { quantity: 1 } },
      ],
    );
    await expect(service.findBySlug('demo')).resolves.toMatchObject({
      customColor: '#e11d48',
      fontFamily: 'serif-elegant',
      popularItemIds: ['i1', 'i2'],
    });

    const fallback = build({ customColor: 'javascript:alert(1)', fontFamily: null });
    await expect(fallback.service.findBySlug('demo')).resolves.toMatchObject({ customColor: null, fontFamily: 'sans-modern' });
  });

  it('si fallan las estadísticas, la carta sigue respondiendo sin badges', async () => {
    const { service } = build({}, jest.fn().mockRejectedValue(new Error('db lenta')));
    await expect(service.findBySlug('demo')).resolves.toMatchObject({ popularItemIds: [] });
  });
});

describe('Badge "Nuevo"', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  it('marca solo lo agregado hace menos de 14 días y después de la carga inicial', () => {
    const items = [
      { id: 'carga-1', createdAt: daysAgo(60) },
      { id: 'carga-2', createdAt: daysAgo(60) },
      { id: 'reciente', createdAt: daysAgo(3) },
      { id: 'viejo', createdAt: daysAgo(20) },
    ];
    expect(newMenuItemIds(items, now)).toEqual(['reciente']);
  });

  it('una carta recién importada no sale entera como "Nuevo"', () => {
    expect(newMenuItemIds([{ id: 'a', createdAt: daysAgo(2) }, { id: 'b', createdAt: daysAgo(1) }], now)).toEqual([]);
    expect(newMenuItemIds([], now)).toEqual([]);
  });
});
