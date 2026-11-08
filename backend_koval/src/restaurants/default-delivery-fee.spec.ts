import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RestaurantsService } from './restaurants.service';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import type { AiService } from '../ai/ai.service';

describe('PATCH /restaurants/:id · tarifa estándar de domicilio (defaultDeliveryFee)', () => {
  const build = () => {
    const prisma: any = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({ bannerUrl: null }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'rest-1', users: [], plan: null, ...data })),
      },
    };
    return { prisma, service: new RestaurantsService(prisma, {} as AiService, { assertSudo: jest.fn() } as any) };
  };
  const sudo = { user: { role: 'OWNER', restaurantId: 'rest-1' } } as any;
  const saved = async (defaultDeliveryFee: number | null | undefined) => {
    const { prisma, service } = build();
    await service.update('rest-1', { defaultDeliveryFee } as UpdateRestaurantDto, sudo);
    return prisma.restaurant.update.mock.calls[0][0].data.defaultDeliveryFee;
  };

  it('guarda la tarifa redondeada a pesos; null o 0 la quitan; sin el campo no se toca', async () => {
    await expect(saved(14999.6)).resolves.toBe(15000);
    await expect(saved(null)).resolves.toBeNull();
    await expect(saved(0)).resolves.toBeNull();
    await expect(saved(undefined)).resolves.toBeUndefined();
  });

  it('valida: número no negativo (null permitido para quitarla)', async () => {
    const errors = async (value: unknown) =>
      (await validate(plainToInstance(UpdateRestaurantDto, { defaultDeliveryFee: value }))).map((e) => e.property);
    await expect(errors(15000)).resolves.toEqual([]);
    await expect(errors(null)).resolves.toEqual([]);
    await expect(errors(-1)).resolves.toEqual(['defaultDeliveryFee']);
    await expect(errors('15000')).resolves.toEqual(['defaultDeliveryFee']);
  });
});
