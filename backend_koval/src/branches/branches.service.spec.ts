import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { DriversService } from '../drivers/drivers.service';

describe('BranchesService · sedes y sede principal', () => {
  const build = (existing: Record<string, unknown> | null = null, counts = { main: 0, others: 0 }) => {
    const tx = {
      branch: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'b-new', ...data })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'b-1', ...data })),
      },
    };
    const prisma: any = {
      branch: {
        count: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.isMain ? counts.main : counts.others)),
        findFirst: jest.fn().mockResolvedValue(existing),
        delete: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
    };
    return { prisma, tx, service: new BranchesService(prisma) };
  };

  it('la primera sede queda como principal aunque no se marque', async () => {
    const { service, tx } = build(null, { main: 0, others: 0 });
    const created = await service.create('rest-1', { name: ' Calle 30 ', address: 'Calle 30 # 10-20' });
    expect(created).toMatchObject({ name: 'Calle 30', isMain: true, restaurantId: 'rest-1' });
    expect(tx.branch.updateMany).toHaveBeenCalledWith({ where: { restaurantId: 'rest-1', isMain: true }, data: { isMain: false } });
  });

  it('una sede nueva marcada como principal le quita el rol a la anterior; si no, no toca nada', async () => {
    const marked = build(null, { main: 1, others: 1 });
    await marked.service.create('rest-1', { name: 'Calle 60', address: 'Calle 60', isMain: true });
    expect(marked.tx.branch.updateMany).toHaveBeenCalled();
    const plain = build(null, { main: 1, others: 1 });
    const created = await plain.service.create('rest-1', { name: 'Calle 60', address: 'Calle 60' });
    expect(created.isMain).toBe(false);
    expect(plain.tx.branch.updateMany).not.toHaveBeenCalled();
  });

  it('no se puede quitar el rol de principal ni desactivar la principal sin designar otra', async () => {
    const { service } = build({ id: 'b-1', isMain: true, isActive: true });
    await expect(service.update('rest-1', 'b-1', { isMain: false })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update('rest-1', 'b-1', { isActive: false })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marcar otra sede como principal desmarca la anterior en la misma transacción', async () => {
    const { service, tx } = build({ id: 'b-2', isMain: false, isActive: true });
    const updated = await service.update('rest-1', 'b-2', { isMain: true });
    expect(tx.branch.updateMany).toHaveBeenCalled();
    expect(updated.isMain).toBe(true);
  });

  it('la principal solo se elimina si es la única sede', async () => {
    const withOthers = build({ id: 'b-1', isMain: true, isActive: true }, { main: 1, others: 1 });
    await expect(withOthers.service.remove('rest-1', 'b-1')).rejects.toBeInstanceOf(BadRequestException);
    const alone = build({ id: 'b-1', isMain: true, isActive: true }, { main: 1, others: 0 });
    await expect(alone.service.remove('rest-1', 'b-1')).resolves.toEqual({ deleted: true });
  });

  it('una sede de otro restaurante da 404', async () => {
    const { service, prisma } = build(null);
    await expect(service.update('rest-1', 'b-ajena', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.branch.findFirst.mock.calls[0][0].where).toEqual({ id: 'b-ajena', restaurantId: 'rest-1' });
  });

  it('zonas y repartidores solo aceptan sedes del mismo restaurante', async () => {
    const prisma: any = {
      branch: { findFirst: jest.fn().mockResolvedValue(null) },
      deliveryZone: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue({ id: 'z1' }), update: jest.fn() },
      deliveryDriver: { create: jest.fn() },
    };
    const zones = new DeliveryZonesService(prisma);
    const drivers = new DriversService(prisma);
    await expect(zones.create('rest-1', { name: 'Norte', fee: 5000, branchId: 'b-ajena' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(zones.update('rest-1', 'z1', { branchId: 'b-ajena' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(drivers.create('rest-1', { name: 'Juan', phone: '3001234567', branchId: 'b-ajena' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.deliveryZone.create).not.toHaveBeenCalled();
    expect(prisma.deliveryZone.update).not.toHaveBeenCalled();
    expect(prisma.deliveryDriver.create).not.toHaveBeenCalled();
  });

  it('asignar una sede propia (o quitarla con null) llega al data de Prisma', async () => {
    const prisma: any = {
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 'b-60' }) },
      deliveryZone: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn().mockResolvedValue({ id: 'z1' }), update: jest.fn().mockResolvedValue({}) },
    };
    const zones = new DeliveryZonesService(prisma);
    await zones.create('rest-1', { name: 'Norte', fee: 5000, branchId: 'b-60' });
    await zones.update('rest-1', 'z1', { branchId: null });
    expect(prisma.deliveryZone.create.mock.calls[0][0].data.branchId).toBe('b-60');
    expect(prisma.deliveryZone.update.mock.calls[0][0].data.branchId).toBeNull();
  });
});
