import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';
import { KitchenAccess } from '../decorators/kitchen-access.decorator';

class FakeController {
  @KitchenAccess()
  listOrders() {}

  editMenu() {}
}

describe('JwtAuthGuard — política RBAC de KITCHEN', () => {
  const guard = new JwtAuthGuard(new Reflector());

  const contextFor = (role: Role, handler: () => void) =>
    ({
      getHandler: () => handler,
      getClass: () => FakeController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    // Simula una autenticación JWT válida (passport) sin token real
    jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate').mockResolvedValue(true);
  });

  afterEach(() => jest.restoreAllMocks());

  it('KITCHEN accede a los endpoints marcados con @KitchenAccess()', async () => {
    await expect(guard.canActivate(contextFor(Role.KITCHEN, FakeController.prototype.listOrders))).resolves.toBe(true);
  });

  it('KITCHEN es rechazado (403) en cualquier endpoint no marcado', async () => {
    await expect(guard.canActivate(contextFor(Role.KITCHEN, FakeController.prototype.editMenu))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('OWNER y SUPERADMIN no se ven afectados', async () => {
    for (const role of [Role.OWNER, Role.SUPERADMIN]) {
      await expect(guard.canActivate(contextFor(role, FakeController.prototype.editMenu))).resolves.toBe(true);
    }
  });
});
