import { BadRequestException, ConflictException, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { OrdersService } from './orders.service';
import { buildCustomerDispatchMessage, buildDriverDispatchMessage } from './dispatch-messages';
import { DriversController } from '../drivers/drivers.controller';
import { DriversService, normalizeDriverPhone } from '../drivers/drivers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';

const ORDER_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const order = {
  id: ORDER_ID,
  restaurantId: 'rest-1',
  customerName: 'Carlos Gómez',
  customerPhone: '3001234567',
  deliveryAddress: 'Cra 45 # 26-85, Barrio Centro',
  notes: 'Timbre dañado, llamar',
  total: 45000,
  paymentStatus: 'PENDING',
  orderType: 'DELIVERY',
  status: 'PREPARING',
  dispatchedAt: null,
  items: [
    { quantity: 2, menuItem: { name: 'Clásica BQ' } },
    { quantity: 1, menuItem: { name: 'Limonada' } },
  ],
};
const driver = { id: 'drv-1', name: 'Juan Pérez', phone: '573109998877', vehicleInfo: 'Moto AKT · ABC12D' };

describe('Mensajes del despacho', () => {
  const d = { name: driver.name, phone: driver.phone, vehicle: driver.vehicleInfo };
  const o = { ...order, customerPhone: '573001234567' };

  it('al cliente: repartidor, vehículo, tiempo y wa.me con texto precargado del pedido', () => {
    const text = buildCustomerDispatchMessage(o, d, 'Burger BQ', 25);
    expect(text).toContain('#0F8FAD5B');
    expect(text).toContain('Repartidor: *Juan Pérez*');
    expect(text).toContain('Vehículo: Moto AKT · ABC12D');
    expect(text).toContain('aprox. 25 minutos');
    const link = text.match(/https:\/\/wa\.me\/573109998877\?text=(\S+)/);
    expect(decodeURIComponent(link![1])).toBe('Hola Juan, soy Carlos. Te escribo por mi pedido #0F8FAD5B de Burger BQ.');
    expect(buildCustomerDispatchMessage(o, { ...d, vehicle: null }, 'Burger BQ')).toContain('aprox. 15-20 minutos');
  });

  it('al repartidor: dirección con mapa, platos, cobro y wa.me al cliente', () => {
    const text = buildDriverDispatchMessage(o, d, 'Burger BQ');
    expect(text).toContain('Dirección: Cra 45 # 26-85, Barrio Centro');
    expect(text).toContain('https://www.google.com/maps/search/?api=1&query=');
    expect(text).toContain('• 2x Clásica BQ');
    expect(text).toContain('Cobrar al entregar:* $45.000 COP');
    expect(text).toContain('https://wa.me/573001234567?text=');
    expect(text).toContain('Notas: Timbre dañado, llamar');
    expect(buildDriverDispatchMessage({ ...o, paymentStatus: 'PAID' }, d, 'Burger BQ')).toContain('Pagado en línea');
  });
});

describe('OrdersService.dispatch', () => {
  const build = (stored: Record<string, unknown> = {}, driverRow: unknown = driver) => {
    const prisma: any = {
      order: {
        findUnique: jest.fn().mockResolvedValue({ ...order, ...stored }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ ...order, ...stored, ...data, restaurant: { name: 'Burger BQ', whatsappPhoneId: null, whatsappToken: null } }),
        ),
      },
      deliveryDriver: { findFirst: jest.fn().mockResolvedValue(driverRow) },
    };
    const gateway: any = { emitOrderStatusUpdated: jest.fn() };
    const whatsapp: any = { sendTextMessage: jest.fn().mockResolvedValue({ success: true }) };
    const service = new OrdersService(prisma, gateway, whatsapp, {} as any);
    return { prisma, gateway, whatsapp, service };
  };
  const owner = { role: Role.OWNER, restaurantId: 'rest-1' };
  const flush = () => new Promise((r) => setImmediate(r));

  it('asigna el repartidor del local, deja el pedido despachado y avisa al cliente y al repartidor (Baileys)', async () => {
    const { prisma, gateway, whatsapp, service } = build();
    await service.dispatch(ORDER_ID, { driverId: 'drv-1', estimatedMinutes: 20 }, owner);

    expect(prisma.deliveryDriver.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'drv-1', restaurantId: 'rest-1', isActive: true } }),
    );
    const data = prisma.order.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'DELIVERED', driverId: 'drv-1', driverName: 'Juan Pérez', driverPhone: '573109998877' });
    expect(data.dispatchedAt).toBeInstanceOf(Date);
    expect(gateway.emitOrderStatusUpdated).toHaveBeenCalled();

    await flush();
    const sends = whatsapp.sendTextMessage.mock.calls;
    expect(sends.map((c: unknown[]) => c[2])).toEqual(['573001234567', '573109998877']);
    expect(sends.every((c: unknown[]) => c[0] === 'rest-1' && c[4] === true)).toBe(true);
    expect(sends[0][3]).toContain('va en camino');
    expect(sends[1][3]).toContain('Domicilio · Burger BQ');
  });

  it('acepta un repartidor ocasional con nombre y celular', async () => {
    const { prisma, service } = build();
    await service.dispatch(ORDER_ID, { driverName: ' Pedro ', driverPhone: '310 555 0000', vehicleInfo: 'Bici' }, owner);
    expect(prisma.deliveryDriver.findFirst).not.toHaveBeenCalled();
    expect(prisma.order.update.mock.calls[0][0].data).toMatchObject({
      driverId: null,
      driverName: 'Pedro',
      driverPhone: '573105550000',
      driverVehicle: 'Bici',
    });
  });

  it('rechaza: pedidos que no son domicilio, cancelados, ya despachados, repartidor ajeno/inactivo o sin datos', async () => {
    await expect(build({ orderType: 'DINE_IN' }).service.dispatch(ORDER_ID, { driverId: 'drv-1' }, owner)).rejects.toThrow(BadRequestException);
    await expect(build({ status: 'CANCELLED' }).service.dispatch(ORDER_ID, { driverId: 'drv-1' }, owner)).rejects.toThrow(ConflictException);
    await expect(build({ dispatchedAt: new Date() }).service.dispatch(ORDER_ID, { driverId: 'drv-1' }, owner)).rejects.toThrow(ConflictException);
    await expect(build({}, null).service.dispatch(ORDER_ID, { driverId: 'drv-otro' }, owner)).rejects.toThrow('Repartidor no encontrado o inactivo');
    await expect(build().service.dispatch(ORDER_ID, { driverName: 'Pedro' }, owner)).rejects.toThrow(BadRequestException);
    const { prisma } = build();
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('un pedido de otro restaurante da 403 (tenant)', async () => {
    const { service } = build();
    await expect(service.dispatch(ORDER_ID, { driverId: 'drv-1' }, { role: Role.OWNER, restaurantId: 'rest-2' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('si el local tiene Meta, ambos mensajes salen por Meta Cloud API', async () => {
    const { prisma, whatsapp, service } = build();
    prisma.order.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...order, ...data, restaurant: { name: 'Burger BQ', whatsappPhoneId: 'pid-1', whatsappToken: 'tok' } }),
    );
    await service.dispatch(ORDER_ID, { driverId: 'drv-1' }, owner);
    await flush();
    expect(whatsapp.sendTextMessage.mock.calls.every((c: unknown[]) => c[0] === 'pid-1' && c[1] === 'tok' && c[4] === false)).toBe(true);
  });
});

describe('Repartidores: CRUD y acceso', () => {
  it('normaliza el celular a wa.me y rechaza números incompletos', () => {
    expect(normalizeDriverPhone('300 123 4567')).toBe('573001234567');
    expect(normalizeDriverPhone('+57 310-999-8877')).toBe('573109998877');
    expect(() => normalizeDriverPhone('12345')).toThrow(BadRequestException);
  });

  it('editar o borrar un repartidor de otro restaurante da 404', async () => {
    const prisma: any = { deliveryDriver: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn(), delete: jest.fn() } };
    const service = new DriversService(prisma);
    await expect(service.update('rest-1', 'drv-ajeno', { isActive: false })).rejects.toThrow('Repartidor no encontrado');
    await expect(service.remove('rest-1', 'drv-ajeno')).rejects.toThrow('Repartidor no encontrado');
    expect(prisma.deliveryDriver.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'drv-ajeno', restaurantId: 'rest-1' } }));
    expect(prisma.deliveryDriver.update).not.toHaveBeenCalled();
    expect(prisma.deliveryDriver.delete).not.toHaveBeenCalled();
  });

  it('la cocina solo puede listar (modal del KDS); crear/editar/borrar es de OWNER o SUPERADMIN', async () => {
    const reflector = new Reflector();
    const ctx = (handler: Function, user: unknown, params: Record<string, string> = { id: 'rest-1' }) =>
      ({
        getHandler: () => handler,
        getClass: () => DriversController,
        switchToHttp: () => ({ getRequest: () => ({ user, params, query: {}, body: {} }) }),
      }) as unknown as ExecutionContext;
    const kitchen = { role: Role.KITCHEN, restaurantId: 'rest-1' };
    jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate').mockResolvedValue(true);
    const jwt = new JwtAuthGuard(reflector);
    const roles = new RolesGuard(reflector);

    await expect(jwt.canActivate(ctx(DriversController.prototype.list, kitchen))).resolves.toBe(true);
    expect(roles.canActivate(ctx(DriversController.prototype.list, kitchen))).toBe(true);
    await expect(jwt.canActivate(ctx(DriversController.prototype.create, kitchen))).rejects.toThrow(ForbiddenException);
    expect(() => roles.canActivate(ctx(DriversController.prototype.create, kitchen))).toThrow(ForbiddenException);
    // Otro restaurante: TenantGuard corta incluso al dueño
    expect(() =>
      new TenantGuard(reflector).canActivate(ctx(DriversController.prototype.list, { role: Role.OWNER, restaurantId: 'rest-1' }, { id: 'rest-2' })),
    ).toThrow(ForbiddenException);
    jest.restoreAllMocks();
  });
});
