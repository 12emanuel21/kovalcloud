import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RestaurantsService } from './restaurants.service';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { CUSTOM_INSTRUCTIONS_MAX_LENGTH, cleanCustomInstructions } from './custom-instructions';
import { stripInternalRestaurantFields } from './sanitize-restaurant';
import type { AiService } from '../ai/ai.service';

describe('Instrucciones especiales del local (customInstructions)', () => {
  const RULE = 'No enviamos jugos naturales a domicilio, ofrecer gaseosa.';

  it('limpia el texto: recorta, une saltos de línea y "" o solo espacios se guardan como null', () => {
    expect(cleanCustomInstructions(`  ${RULE}  `)).toBe(RULE);
    expect(cleanCustomInstructions('Regla 1  \r\n\r\n\r\n\r\nRegla 2')).toBe('Regla 1\n\nRegla 2');
    expect(cleanCustomInstructions('')).toBeNull();
    expect(cleanCustomInstructions('   \n  ')).toBeNull();
    expect(cleanCustomInstructions(null)).toBeNull();
    expect(cleanCustomInstructions(undefined)).toBeUndefined();
  });

  it('valida un máximo de 800 caracteres después de recortar espacios', async () => {
    const errors = async (value: unknown) =>
      (await validate(plainToInstance(UpdateRestaurantDto, { customInstructions: value }))).map((e) => e.property);
    expect(CUSTOM_INSTRUCTIONS_MAX_LENGTH).toBe(800);
    await expect(errors('a'.repeat(800))).resolves.toEqual([]);
    await expect(errors(`   ${'a'.repeat(800)}   `)).resolves.toEqual([]);
    await expect(errors('a'.repeat(801))).resolves.toEqual(['customInstructions']);
    await expect(errors(null)).resolves.toEqual([]);
    await expect(errors('')).resolves.toEqual([]);
    await expect(errors(123)).resolves.toEqual(['customInstructions']);
  });

  describe('PATCH /restaurants/:id', () => {
    const saved = async (customInstructions: string | null | undefined) => {
      const prisma: any = {
        restaurant: {
          findUnique: jest.fn().mockResolvedValue({ bannerUrl: null }),
          update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'rest-1', users: [], plan: null, ...data })),
        },
      };
      const service = new RestaurantsService(prisma, {} as AiService, { assertSudo: jest.fn() } as any);
      await service.update('rest-1', { customInstructions } as UpdateRestaurantDto, { user: { role: 'OWNER', restaurantId: 'rest-1' } } as any);
      return prisma.restaurant.update.mock.calls[0][0].data.customInstructions;
    };

    it('guarda el texto recortado; "" y null las borran; sin el campo no se toca', async () => {
      await expect(saved(`  ${RULE}\n`)).resolves.toBe(RULE);
      await expect(saved('')).resolves.toBeNull();
      await expect(saved(null)).resolves.toBeNull();
      await expect(saved(undefined)).resolves.toBeUndefined();
    });
  });

  it('nunca salen en la carta pública (GET /restaurants/slug/:slug)', async () => {
    expect(stripInternalRestaurantFields({ id: 'r1', name: 'Betania', customInstructions: RULE })).toEqual({ id: 'r1', name: 'Betania' });
    const prisma: any = {
      restaurant: { findUnique: jest.fn().mockResolvedValue({ id: 'r1', slug: 'betania', customInstructions: RULE, categories: [] }) },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      orderItem: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    const service = new RestaurantsService(prisma, {} as AiService, {} as any);
    const publicRestaurant = await service.findBySlug('betania');
    expect(publicRestaurant).not.toHaveProperty('customInstructions');
    expect(publicRestaurant).toMatchObject({ id: 'r1', slug: 'betania' });
  });
});
