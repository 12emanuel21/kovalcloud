import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';
import { OrdersGateway } from './orders.gateway';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersGateway: OrdersGateway,
  ) {}

  async create(createOrderDto: CreateOrderDto) {
    const {
      restaurantId,
      orderType,
      tableNumber,
      channel,
      customerName,
      customerPhone,
      deliveryAddress,
      notes,
      status,
      items,
    } = createOrderDto;

    // 1. Validar que el restaurante exista
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    // 2. Validar que la orden contenga al menos un item
    if (!items || items.length === 0) {
      throw new BadRequestException('El pedido debe contener al menos un producto');
    }

    // 3. Validar productos y calcular precios
    const menuItemIds = items.map((i) => i.menuItemId);
    const menuItems = await this.prisma.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        restaurantId,
      },
    });

    if (menuItems.length !== menuItemIds.length) {
      throw new NotFoundException(
        'Uno o más productos no pertenecen al restaurante o no existen',
      );
    }

    let calculatedTotal = 0;
    const itemsToCreate = items.map((item) => {
      const menuItem = menuItems.find((m) => m.id === item.menuItemId);
      if (!menuItem) {
        throw new NotFoundException(`Producto con ID ${item.menuItemId} no encontrado`);
      }
      const unitPrice = item.unitPrice !== undefined ? item.unitPrice : menuItem.price;
      const subtotal = unitPrice * item.quantity;
      calculatedTotal += subtotal;

      return {
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice,
        subtotal,
      };
    });

    // 4. Crear la orden y sus items dentro de una transacción de Prisma
    const createdOrder = await this.prisma.$transaction(async (tx) => {
      return await tx.order.create({
        data: {
          restaurantId,
          orderType,
          tableNumber,
          channel,
          customerName,
          customerPhone,
          deliveryAddress,
          notes,
          status: status ?? OrderStatus.PENDING,
          total: calculatedTotal,
          items: {
            create: itemsToCreate.map((item) => ({
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              subtotal: item.subtotal,
            })),
          },
        },
        include: {
          items: {
            include: {
              menuItem: true,
            },
          },
        },
      });
    });

    // 5. Emitir evento WebSocket en tiempo real
    this.ordersGateway.emitNewOrder(restaurantId, createdOrder);

    return createdOrder;
  }

  async findAll(restaurantId?: string) {
    return await this.prisma.order.findMany({
      where: restaurantId ? { restaurantId } : {},
      include: {
        items: {
          include: {
            menuItem: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            menuItem: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }

    return order;
  }

  async update(id: string, updateOrderDto: UpdateOrderDto) {
    const existingOrder = await this.findOne(id);

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: {
        customerName: updateOrderDto.customerName,
        customerPhone: updateOrderDto.customerPhone,
        deliveryAddress: updateOrderDto.deliveryAddress,
        notes: updateOrderDto.notes,
        status: updateOrderDto.status,
      },
      include: {
        items: {
          include: {
            menuItem: true,
          },
        },
      },
    });

    // 1. Emitir evento WebSocket de orden actualizada
    this.ordersGateway.emitOrderUpdated(existingOrder.restaurantId, updatedOrder);

    // 2. Notificar al cliente vía WhatsApp si el estado cambió
    if (updateOrderDto.status && updateOrderDto.status !== existingOrder.status) {
      this.sendOrderStatusNotification(updatedOrder, updateOrderDto.status);
    }

    return updatedOrder;
  }

  async remove(id: string) {
    await this.findOne(id);
    return await this.prisma.order.delete({
      where: { id },
    });
  }

  /**
   * Envía una notificación por WhatsApp al cliente informando el cambio de estado de su orden
   */
  private sendOrderStatusNotification(order: { id: string; customerName: string; customerPhone?: string | null }, newStatus: OrderStatus) {
    if (!order.customerPhone) return;

    const shortId = order.id.slice(0, 8).toUpperCase();
    let text = '';

    switch (newStatus) {
      case OrderStatus.PREPARING:
        text = `👨‍🍳 *¡Tu orden está en preparación!* 🍕\n\nHola ${order.customerName}, la cocina ha iniciado la preparación de tu pedido *#${shortId}*. Te avisaremos cuando vaya en camino.`;
        break;
      case OrderStatus.DELIVERED:
        text = `🛵 *¡Tu pedido ha sido entregado / despachado!* 🎉\n\nHola ${order.customerName}, tu orden *#${shortId}* está lista. ¡Que lo disfrutes y gracias por elegirnos!`;
        break;
      case OrderStatus.CANCELLED:
        text = `⚠️ *Actualización de tu pedido*\n\nHola ${order.customerName}, tu orden *#${shortId}* ha sido cancelada. Si tienes alguna duda, escríbenos por aquí.`;
        break;
      default:
        return;
    }

    // Petición HTTP no bloqueante a whatsapp_service
    try {
      const whatsappServiceUrl = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:5000/send';
      fetch(whatsappServiceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: order.customerPhone,
          text,
        }),
      }).catch((err: Error) => {
        console.warn(`[WhatsApp Notify] Servicio no disponible (${order.customerPhone}):`, err.message);
      });
    } catch (e: unknown) {
      const error = e as Error;
      console.warn(`[WhatsApp Notify] Error:`, error.message);
    }
  }
}
