import { NotFoundException } from '@nestjs/common';
import { DeliveryZonesService } from './delivery-zones.service';

describe('DeliveryZonesService', () => {
  const build = (zones: unknown[] = [{ id: 'z1', name: 'Norte', keywords: ['riomar'], fee: 6000 }]) => {
    const prisma: any = {
      deliveryZone: {
        findMany: jest.fn().mockResolvedValue(zones),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new', ...data })),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    return { prisma, service: new DeliveryZonesService(prisma) };
  };

  it('calculateDeliveryFee consulta solo las zonas activas del restaurante', async () => {
    const { prisma, service } = build();
    await expect(service.calculateDeliveryFee('rest-1', 'Riomar')).resolves.toMatchObject({ isCovered: true, deliveryFee: 6000 });
    expect(prisma.deliveryZone.findMany.mock.calls[0][0].where).toEqual({ restaurantId: 'rest-1', isActive: true });
    await expect(service.calculateDeliveryFee('rest-1', 'Soledad')).resolves.toMatchObject({ isCovered: false, fallback: 'PICKUP' });
  });

  it('recoger (TAKEAWAY) y mesa (DINE_IN) no pagan domicilio: ni se consulta la cobertura', async () => {
    const { prisma, service } = build();
    await expect(service.quoteForOrder('rest-1', 'TAKEAWAY', 'Soledad')).resolves.toBeNull();
    await expect(service.quoteForOrder('rest-1', 'DINE_IN', 'Soledad')).resolves.toBeNull();
    expect(prisma.deliveryZone.findMany).not.toHaveBeenCalled();
    // Sin tipo: la carta web lo trata como domicilio
    await expect(service.quoteForOrder('rest-1', undefined, 'Riomar')).resolves.toMatchObject({ deliveryFee: 6000 });
  });

  it('crear: limpia y deduplica las palabras clave y redondea la tarifa', async () => {
    const { prisma, service } = build();
    await service.create('rest-1', { name: ' Norte ', keywords: [' Riomar ', 'riomar', 'Alto  Prado', ''], fee: 5999.6 });
    expect(prisma.deliveryZone.create.mock.calls[0][0].data).toEqual({
      restaurantId: 'rest-1',
      name: 'Norte',
      keywords: ['Riomar', 'Alto Prado'],
      fee: 6000,
    });
  });

  it('editar o borrar una zona de otro restaurante da 404', async () => {
    const { prisma, service } = build();
    await expect(service.update('rest-1', 'ajena', { fee: 1 })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('rest-1', 'ajena')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.deliveryZone.findFirst).toHaveBeenCalledWith({ where: { id: 'ajena', restaurantId: 'rest-1' }, select: { id: true } });
    expect(prisma.deliveryZone.delete).not.toHaveBeenCalled();
  });
});
