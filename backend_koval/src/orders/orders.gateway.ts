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

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(OrdersGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`🔌 Cliente WebSocket conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`❌ Cliente WebSocket desconectado: ${client.id}`);
  }

  @SubscribeMessage('join_restaurant')
  handleJoinRestaurant(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { restaurantId: string } | string,
  ) {
    const restaurantId = typeof data === 'string' ? data : data?.restaurantId;
    if (restaurantId) {
      const room = `restaurant_${restaurantId}`;
      client.join(room);
      this.logger.log(`🏢 Cliente ${client.id} suscrito a sala: ${room}`);
      return { event: 'joined_restaurant', room };
    }
  }

  emitNewOrder(restaurantId: string, order: unknown) {
    this.logger.log(`🔔 Emitiendo evento [new_order] a sala restaurant_${restaurantId}`);
    if (this.server) {
      this.server.to(`restaurant_${restaurantId}`).emit('new_order', order);
      }
  }

  emitOrderUpdated(restaurantId: string, order: unknown) {
    this.logger.log(`🔄 Emitiendo evento [order_updated] a sala restaurant_${restaurantId}`);
    if (this.server) {
      this.server.to(`restaurant_${restaurantId}`).emit('order_updated', order);
      }
  }

  emitOrderStatusUpdated(restaurantId: string, order: unknown) {
    this.logger.log(`🔄 Emitiendo evento [order_status_updated] / [order_updated] a sala restaurant_${restaurantId}`);
    if (this.server) {
      this.server.to(`restaurant_${restaurantId}`).emit('order_status_updated', order);
      this.server.to(`restaurant_${restaurantId}`).emit('order_updated', order);
      }
  }
}
