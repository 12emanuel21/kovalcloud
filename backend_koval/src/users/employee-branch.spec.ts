import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';

describe('UsersService · sede de las cuentas de cocina', () => {
  const owner = { id: 'owner-a', role: Role.OWNER, restaurantId: 'rest-a' };
  const build = (target: Record<string, unknown> | null, branch: Record<string, unknown> | null = { id: 'b-60' }) => {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockImplementation(({ where }) => (where.email ? null : target)),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'new', ...data })),
        update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      },
      restaurant: { findUnique: jest.fn().mockResolvedValue({ id: 'rest-a' }) },
      branch: { findFirst: jest.fn().mockResolvedValue(branch) },
    };
    const gateway = { disconnectUser: jest.fn(), moveUserToBranch: jest.fn() };
    return { prisma, gateway, service: new UsersService(prisma, gateway as any, {} as any, {} as any) };
  };

  it('crea la cocina de una sede (la sede debe ser del mismo restaurante)', async () => {
    const { service, prisma } = build(null);
    const created = await service.createEmployee(owner, { name: 'Cocina 60', email: 'c60@b.co', password: '12345678', branchId: 'b-60' });
    expect(created).toMatchObject({ role: Role.KITCHEN, restaurantId: 'rest-a', branchId: 'b-60' });
    expect(prisma.branch.findFirst.mock.calls[0][0].where).toEqual({ id: 'b-60', restaurantId: 'rest-a' });

    const foreign = build(null, null);
    await expect(
      foreign.service.createEmployee(owner, { name: 'X', email: 'x@b.co', password: '12345678', branchId: 'b-ajena' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(foreign.prisma.user.create).not.toHaveBeenCalled();
  });

  it('cambia la sede de una cocina y mueve sus KDS abiertos a la nueva sala', async () => {
    const { service, prisma, gateway } = build({ id: 'k1', role: Role.KITCHEN, restaurantId: 'rest-a' });
    await service.updateBranch(owner, 'k1', 'b-60');
    expect(prisma.user.update.mock.calls[0][0].data).toEqual({ branchId: 'b-60' });
    expect(gateway.moveUserToBranch).toHaveBeenCalledWith('k1', 'b-60');
    await service.updateBranch(owner, 'k1', null);
    expect(prisma.user.update.mock.calls[1][0].data).toEqual({ branchId: null });
  });

  it('OWNER no puede tocar cocinas de otro restaurante ni cuentas que no son de cocina (404)', async () => {
    const other = build({ id: 'k2', role: Role.KITCHEN, restaurantId: 'rest-b' });
    await expect(other.service.updateBranch(owner, 'k2', 'b-60')).rejects.toBeInstanceOf(NotFoundException);
    const ownerTarget = build({ id: 'o2', role: Role.OWNER, restaurantId: 'rest-a' });
    await expect(ownerTarget.service.updateBranch(owner, 'o2', null)).rejects.toBeInstanceOf(NotFoundException);
    expect(other.prisma.user.update).not.toHaveBeenCalled();
    expect(ownerTarget.prisma.user.update).not.toHaveBeenCalled();
  });
});
