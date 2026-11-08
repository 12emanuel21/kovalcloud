import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import type { TenantUser } from '../auth/tenant-access';
import { redactOrderFinancials } from './order-visibility';
import { isTokenRevoked } from '../auth/token-revocation';

type SocketUser = TenantUser & { id: string };

/** Sala del personal de cocina: recibe los mismos eventos, sin datos financieros */
const kitchenRoom = (restaurantId: string) => `restaurant_${restaurantId}_kitchen`;
/** Cocina de una sede (multisede): solo los pedidos de esa sede, sin datos financieros */
export const branchKitchenRoom = (restaurantId: string, branchId: string) => `restaurant_${restaurantId}_kitchen_${branchId}`;

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(OrdersGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /** Token desde handshake.auth.token, header Authorization o query ?token= */
  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken) return authToken.replace(/^Bearer\s+/i, '');

    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string' && /^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, '');

    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken) return queryToken;

    return null;
  }

  /** Verifica el JWT y carga rol/restaurante actuales desde la BD */
  private async authenticate(client: Socket): Promise<SocketUser | null> {
    const token = this.extractToken(client);
    if (!token) return null;
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, restaurantId: true, branchId: true, isActive: true, passwordChangedAt: true },
      });
      if (!user?.isActive || isTokenRevoked(payload.iat, user.passwordChangedAt)) return null;
      return { id: user.id, role: user.role, restaurantId: user.restaurantId, branchId: user.branchId ?? null };
    } catch {
      return null;
    }
  }

  private reject(client: Socket, reason: string) {
    this.logger.warn(`⛔ WebSocket ${client.id} rechazado: ${reason}`);
    client.emit('unauthorized', { message: reason });
    client.disconnect(true);
  }

  async handleConnection(client: Socket) {
    const user = await this.authenticate(client);
    if (!user) {
      return this.reject(client, 'Token ausente o inválido');
    }
    client.data.user = user;
    this.logger.log(`🔌 Cliente WebSocket conectado: ${client.id} (${user.role})`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`❌ Cliente WebSocket desconectado: ${client.id}`);
  }

  @SubscribeMessage('join_restaurant')
  async handleJoinRestaurant(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { restaurantId: string } | string,
  ) {
    // handleConnection es async: si el join llega antes de terminar, se autentica aquí
    const user: SocketUser | null = client.data.user ?? (await this.authenticate(client));
    if (!user) {
      return this.reject(client, 'Token ausente o inválido');
    }

    const restaurantId = typeof data === 'string' ? data : data?.restaurantId;
    if (!restaurantId) return;

    if (user.role !== Role.SUPERADMIN && user.restaurantId !== restaurantId) {
      return this.reject(client, `Sin acceso a la sala del restaurante ${restaurantId}`);
    }

    // La cocina va a una sala propia que solo recibe pedidos sin importes; la de una sede, a la de su sede
    const room = this.roomFor(user, restaurantId);
    client.join(room);
    this.logger.log(`🏢 Cliente ${client.id} suscrito a sala: ${room}`);
    return { event: 'joined_restaurant', room };
  }

  private roomFor(user: SocketUser, restaurantId: string): string {
    if (user.role !== Role.KITCHEN) return `restaurant_${restaurantId}`;
    return user.branchId ? branchKitchenRoom(restaurantId, user.branchId) : kitchenRoom(restaurantId);
  }

  /**
   * La cuenta de cocina cambió de sede: sus KDS abiertos pasan a la sala de la nueva sede sin
   * recargar ni cerrar sesión.
   */
  moveUserToBranch(userId: string, branchId: string | null) {
    if (!this.server) return;
    for (const client of this.server.sockets.sockets.values()) {
      const user = client.data.user as SocketUser | undefined;
      if (user?.id !== userId || user.role !== Role.KITCHEN) continue;
      const kitchenRooms = [...client.rooms].filter((room) => /^restaurant_.+_kitchen(_.+)?$/.test(room));
      const updated: SocketUser = { ...user, branchId };
      client.data.user = updated;
      for (const room of kitchenRooms) {
        const restaurantId = /^restaurant_(.+?)_kitchen/.exec(room)?.[1];
        void client.leave(room);
        if (restaurantId) void client.join(this.roomFor(updated, restaurantId));
      }
    }
  }

  /** Cierra en el acto los WebSockets de un usuario (p. ej. al desactivar su acceso) */
  disconnectUser(userId: string, reason = 'Tu acceso al sistema fue desactivado') {
    if (!this.server) return;
    for (const client of this.server.sockets.sockets.values()) {
      if ((client.data.user as SocketUser | undefined)?.id === userId) {
        this.reject(client, reason);
      }
    }
  }

  /**
   * Emite a la sala completa del restaurante y, sin importes, a la sala de cocina general. Si el
   * pedido tiene sede, también (sin importes) a la cocina de esa sede.
   */
  private emitToRestaurant(restaurantId: string, events: string[], order: unknown) {
    if (!this.server) return;
    const kitchenOrder = redactOrderFinancials(order as Record<string, any>);
    const branchId = (order as { branchId?: unknown } | null)?.branchId;
    for (const event of events) {
      this.server.to(`restaurant_${restaurantId}`).emit(event, order);
      this.server.to(kitchenRoom(restaurantId)).emit(event, kitchenOrder);
      if (typeof branchId === 'string' && branchId) {
        this.server.to(branchKitchenRoom(restaurantId, branchId)).emit(event, kitchenOrder);
      }
    }
  }

  emitNewOrder(restaurantId: string, order: unknown) {
    this.logger.log(`🔔 Emitiendo evento [new_order] a sala restaurant_${restaurantId}`);
    this.emitToRestaurant(restaurantId, ['new_order'], order);
  }

  emitOrderUpdated(restaurantId: string, order: unknown) {
    this.logger.log(`🔄 Emitiendo evento [order_updated] a sala restaurant_${restaurantId}`);
    this.emitToRestaurant(restaurantId, ['order_updated'], order);
  }

  emitOrderStatusUpdated(restaurantId: string, order: unknown) {
    this.logger.log(`🔄 Emitiendo evento [order_status_updated] / [order_updated] a sala restaurant_${restaurantId}`);
    this.emitToRestaurant(restaurantId, ['order_status_updated', 'order_updated'], order);
  }
}
