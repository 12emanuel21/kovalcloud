import { Role } from '@prisma/client';
import { OrdersGateway, branchKitchenRoom } from './orders.gateway';

describe('OrdersGateway · KDS segmentado por sede', () => {
  const build = () => {
    const emitted: Array<{ room: string; event: string; payload: any }> = [];
    const gateway = new OrdersGateway({} as any, {} as any);
    gateway.server = {
      to: (room: string) => ({ emit: (event: string, payload: any) => emitted.push({ room, event, payload }) }),
      sockets: { sockets: new Map() },
    } as any;
    return { gateway, emitted };
  };
  const socket = (user: Record<string, unknown>) => {
    const rooms = new Set<string>(['socket-id']);
    return {
      id: 'socket-id',
      data: { user: { id: 'u1', ...user } },
      rooms,
      join: jest.fn((room: string) => rooms.add(room)),
      leave: jest.fn((room: string) => rooms.delete(room)),
      emit: jest.fn(),
      disconnect: jest.fn(),
    } as any;
  };

  it('la cocina de una sede entra a la sala de su sede; sin sede, a la de cocina general; el dueño, a la general', async () => {
    const { gateway } = build();
    const branchKitchen = socket({ role: Role.KITCHEN, restaurantId: 'rest-1', branchId: 'b-60' });
    const kitchen = socket({ role: Role.KITCHEN, restaurantId: 'rest-1', branchId: null });
    const owner = socket({ role: Role.OWNER, restaurantId: 'rest-1', branchId: null });
    await expect(gateway.handleJoinRestaurant(branchKitchen, { restaurantId: 'rest-1' })).resolves.toMatchObject({
      room: 'restaurant_rest-1_kitchen_b-60',
    });
    await expect(gateway.handleJoinRestaurant(kitchen, { restaurantId: 'rest-1' })).resolves.toMatchObject({ room: 'restaurant_rest-1_kitchen' });
    await expect(gateway.handleJoinRestaurant(owner, { restaurantId: 'rest-1' })).resolves.toMatchObject({ room: 'restaurant_rest-1' });
  });

  it('un pedido con sede se emite a la sala general, a la cocina general y a la cocina de su sede (sin importes)', () => {
    const { gateway, emitted } = build();
    gateway.emitNewOrder('rest-1', { id: 'o1', branchId: 'b-60', total: 31000, items: [] });
    expect(emitted.map((e) => e.room)).toEqual(['restaurant_rest-1', 'restaurant_rest-1_kitchen', branchKitchenRoom('rest-1', 'b-60')]);
    expect(emitted[0].payload.total).toBe(31000);
    expect(emitted[2].payload.total).toBeNull();
  });

  it('un pedido sin sede no se emite a ninguna cocina de sede', () => {
    const { gateway, emitted } = build();
    gateway.emitOrderStatusUpdated('rest-1', { id: 'o1', branchId: null, total: 1000, items: [] });
    expect(emitted.every((e) => !/_kitchen_/.test(e.room))).toBe(true);
    expect(new Set(emitted.map((e) => e.event))).toEqual(new Set(['order_status_updated', 'order_updated']));
  });

  it('al cambiar la sede de una cocina, sus KDS abiertos pasan a la sala de la nueva sede', async () => {
    const { gateway } = build();
    const client = socket({ role: Role.KITCHEN, restaurantId: 'rest-1', branchId: null });
    (gateway.server.sockets.sockets as Map<string, any>).set(client.id, client);
    await gateway.handleJoinRestaurant(client, { restaurantId: 'rest-1' });
    gateway.moveUserToBranch('u1', 'b-30');
    expect(client.rooms.has('restaurant_rest-1_kitchen')).toBe(false);
    expect(client.rooms.has('restaurant_rest-1_kitchen_b-30')).toBe(true);
    expect(client.data.user.branchId).toBe('b-30');
  });
});
