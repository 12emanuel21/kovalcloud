import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { RestaurantsService } from './restaurants.service';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import type { AiService } from '../ai/ai.service';
import { buildWebOrderReceivedMessage } from '../meta-whatsapp/order-flow';

describe('Ajustes › Domicilio: botones rápidos y tarifa fija', () => {
  const sudo = { password: 'x' } as any;
  const build = (stored: Record<string, unknown> = {}) => {
    const prisma: any = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'rest-1', bannerUrl: null, users: [], plan: null, ...stored }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'rest-1', users: [], plan: null, ...data })),
      },
    };
    const twoFactorAuth = { assertSudo: jest.fn().mockResolvedValue(undefined) };
    return { prisma, service: new RestaurantsService(prisma, {} as AiService, twoFactorAuth as any) };
  };

  it('guarda los montos limpios (enteros, sin repetir, de menor a mayor); [] o null vuelven a los de siempre', async () => {
    const { prisma, service } = build();
    await service.update('rest-1', { deliveryFeePresets: [6000, 0, 3000, 3000] } as UpdateRestaurantDto, sudo);
    expect(prisma.restaurant.update.mock.calls[0][0].data.deliveryFeePresets).toEqual([0, 3000, 6000]);

    await service.update('rest-1', { deliveryFeePresets: [] } as UpdateRestaurantDto, sudo);
    await service.update('rest-1', { deliveryFeePresets: null } as UpdateRestaurantDto, sudo);
    expect(prisma.restaurant.update.mock.calls[1][0].data.deliveryFeePresets).toBe(Prisma.DbNull);
    expect(prisma.restaurant.update.mock.calls[2][0].data.deliveryFeePresets).toBe(Prisma.DbNull);

    // Otros guardados no tocan los montos ni la tarifa fija
    await service.update('rest-1', { name: 'Betania' } as UpdateRestaurantDto, sudo);
    expect(prisma.restaurant.update.mock.calls[3][0].data).toMatchObject({ deliveryFeePresets: undefined, flatDeliveryFee: undefined });
  });

  it('tarifa fija única: se guarda en pesos enteros; null la quita (vuelve el domicilio manual)', async () => {
    const { prisma, service } = build();
    await service.update('rest-1', { flatDeliveryFee: 5000 } as UpdateRestaurantDto, sudo);
    await service.update('rest-1', { flatDeliveryFee: 0 } as UpdateRestaurantDto, sudo);
    await service.update('rest-1', { flatDeliveryFee: null } as UpdateRestaurantDto, sudo);
    expect(prisma.restaurant.update.mock.calls.map(([arg]: any[]) => arg.data.flatDeliveryFee)).toEqual([5000, 0, null]);
  });

  it('GET /restaurants/:id entrega los montos a usar (los de siempre si no hay guardados)', async () => {
    await expect(build({ deliveryFeePresets: null }).service.findOne('rest-1')).resolves.toMatchObject({
      deliveryFeePresets: [0, 3000, 4000, 5000, 6000, 8000],
    });
    await expect(build({ deliveryFeePresets: [2000, 7000] }).service.findOne('rest-1')).resolves.toMatchObject({
      deliveryFeePresets: [2000, 7000],
    });
  });

  it('el DTO valida enteros de 0 en adelante, máximo 10 montos', async () => {
    const errors = async (body: Record<string, unknown>) =>
      (await validate(plainToInstance(UpdateRestaurantDto, body))).map((e) => e.property);
    await expect(errors({ deliveryFeePresets: [0, 3000, 5000], flatDeliveryFee: 4000 })).resolves.toEqual([]);
    await expect(errors({ deliveryFeePresets: null, flatDeliveryFee: null })).resolves.toEqual([]);
    await expect(errors({ deliveryFeePresets: [-1000] })).resolves.toEqual(['deliveryFeePresets']);
    await expect(errors({ deliveryFeePresets: [1500.5] })).resolves.toEqual(['deliveryFeePresets']);
    await expect(errors({ deliveryFeePresets: Array.from({ length: 11 }, (_, i) => i * 1000) })).resolves.toEqual(['deliveryFeePresets']);
    await expect(errors({ deliveryFeePresets: 5000 })).resolves.toEqual(['deliveryFeePresets']);
    await expect(errors({ flatDeliveryFee: -1 })).resolves.toEqual(['flatDeliveryFee']);
    await expect(errors({ flatDeliveryFee: 3000.5 })).resolves.toEqual(['flatDeliveryFee']);
  });
});

describe('Acuse del pedido web con el domicilio por definir', () => {
  it('no dice que ya está en cocina ni manda datos de pago: el local confirma el domicilio en instantes', () => {
    const text = buildWebOrderReceivedMessage(
      { orderType: 'DELIVERY', paymentMethod: 'TRANSFERENCIA', paymentStatus: 'PENDING', deliveryFeePending: true },
      4,
      'Ana',
      'Nequi 300',
    );
    expect(text).toBe(
      '¡Hola Ana! Recibimos tu pedido *#04*. 🛵 En instantes te confirmamos por aquí el valor del domicilio (según tu dirección y el clima) y el total a pagar.',
    );
    // Ya definido (o tarifa fija): el acuse de siempre
    expect(
      buildWebOrderReceivedMessage({ orderType: 'DELIVERY', paymentMethod: 'CASH', paymentStatus: 'PENDING', deliveryFeePending: false }, 4, 'Ana'),
    ).toContain('El equipo ya lo está preparando en cocina');
  });
});
