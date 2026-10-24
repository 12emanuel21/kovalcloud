import {
  ConflictException,
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { MetaWhatsAppService } from '../meta-whatsapp/meta-whatsapp.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';
import { OrdersGateway } from './orders.gateway';
import { buildClosedNotice, isRestaurantClosed } from '../restaurants/business-hours';
import { assertTenantAccess, resolveTenantFilter, TenantUser } from '../auth/tenant-access';
import { sanitizeRestaurant } from '../restaurants/sanitize-restaurant';
import { isWompiReady, WompiCheckoutService } from '../payments/wompi-checkout.service';
import { normalizeColombianPhone } from './phone';

/** Mensaje de WhatsApp con el link de pago (plan B si el cliente cierra el checkout) */
export function buildPaymentLinkMessage(restaurantName: string, orderId: string, total: number, url: string): string {
  return (
    `🧾 ¡Recibimos tu pedido #${orderId.slice(0, 8).toUpperCase()} en ${restaurantName}! ` +
    `Total: $${total.toLocaleString('es-CO')} COP.\n\n` +
    `💳 Si no alcanzaste a pagar, puedes hacerlo aquí:\n${url}\n\n` +
    'Apenas se confirme el pago te avisamos por este chat.'
  );
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersGateway: OrdersGateway,
    @Inject(forwardRef(() => MetaWhatsAppService))
    private readonly metaWhatsAppService: MetaWhatsAppService,
    private readonly wompiCheckout: WompiCheckoutService,
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
      items,
      paymentMethod,
    } = createOrderDto;
    // Endpoint público: `status` y `unitPrice` del cliente se ignoran.
    // El pedido nace PENDING y los precios salen siempre de la base de datos.

    // 1. Validar que el restaurante exista
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    // 1.5. El endpoint es público: la carta deshabilita el botón, pero se valida también aquí
    if (isRestaurantClosed(restaurant)) {
      throw new ConflictException(buildClosedNotice(restaurant));
    }

    // 1.6. Pago en línea: se valida antes de crear nada para que el cliente pueda elegir efectivo
    const payOnline = paymentMethod === 'WOMPI';
    if (payOnline && !isWompiReady(restaurant)) {
      throw new BadRequestException(
        'Este restaurante no tiene habilitado el pago en línea. Elige pago en efectivo / contra entrega.',
      );
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
        isAvailable: true,
        deletedAt: null,
      },
    });

    if (menuItems.length !== new Set(menuItemIds).size) {
      throw new NotFoundException(
        'Uno o más productos no pertenecen al restaurante, no existen o no están disponibles',
      );
    }

    let calculatedTotal = 0;
    const itemsToCreate = items.map((item) => {
      const menuItem = menuItems.find((m) => m.id === item.menuItemId);
      if (!menuItem) {
        throw new NotFoundException(`Producto con ID ${item.menuItemId} no encontrado`);
      }
      const unitPrice = menuItem.price;
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
          // Formato internacional (573001234567): lo usan Baileys/Meta para el link de pago y los estados
          customerPhone: normalizeColombianPhone(customerPhone),
          deliveryAddress,
          notes,
          status: OrderStatus.PENDING,
          total: calculatedTotal,
          // WOMPI se reemplaza por el método real (NEQUI, CARD...) cuando llega el webhook
          paymentMethod: payOnline ? 'WOMPI' : 'CASH',
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

    // 4.5. Link de pago de Wompi (antes de emitir: el Kanban ya ve la referencia = "pago pendiente")
    let wompiCheckoutUrl: string | null = null;
    let order = createdOrder;
    if (payOnline) {
      try {
        const link = await this.wompiCheckout.generatePaymentLink(createdOrder, restaurant);
        wompiCheckoutUrl = link.url;
        order = { ...createdOrder, paymentReference: link.reference };
      } catch (error) {
        // El pedido ya existe: el cliente sigue por WhatsApp y el local cobra por otro medio
        this.logger.error(`No se pudo generar el link de Wompi del pedido ${createdOrder.id}:`, error);
      }
    }

    // 5. Emitir evento WebSocket en tiempo real
    this.ordersGateway.emitNewOrder(restaurantId, order);

    // 6. Plan B por WhatsApp: si el cliente cierra el navegador, conserva el link de pago
    if (wompiCheckoutUrl) {
      void this.notifyCustomer(
        { customerPhone: order.customerPhone, restaurantId, restaurant },
        buildPaymentLinkMessage(restaurant.name, order.id, order.total, wompiCheckoutUrl),
      );
    }

    return { ...order, wompiCheckoutUrl };
  }

  async findAll(user: TenantUser, requestedRestaurantId?: string) {
    const restaurantId = resolveTenantFilter(user, requestedRestaurantId);
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

  async findOne(id: string, user: TenantUser) {
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
    assertTenantAccess(user, order.restaurantId);

    return order;
  }

  async updateOrderStatus(orderId: string, status: string, user: TenantUser, estimatedMinutes?: unknown) {
    if (!Object.values(OrderStatus).includes(status as OrderStatus)) {
      throw new BadRequestException(
        `Estado inválido. Valores permitidos: ${Object.values(OrderStatus).join(', ')}`,
      );
    }
    let minutes: number | undefined;
    if (estimatedMinutes !== undefined && estimatedMinutes !== null) {
      minutes = Number(estimatedMinutes);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) {
        throw new BadRequestException('estimatedMinutes debe ser un número entero entre 1 y 240');
      }
    }
    await this.findOne(orderId, user);

    // 1. Actualizar en Prisma
    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: status as OrderStatus },
      include: {
        restaurant: true,
        items: {
          include: {
            menuItem: true,
          },
        },
      },
    });

    // 2. Emitir evento WebSocket para que la tarjeta se mueva en el Kanban del frontend
    this.ordersGateway.emitOrderStatusUpdated(updatedOrder.restaurantId, this.toOrderResponse(updatedOrder));

    // 3. Notificar al cliente por WhatsApp según el nuevo estado (en segundo plano: no frena al KDS)
    const mensajeCliente = this.buildStatusMessage(status as OrderStatus, minutes);
    if (mensajeCliente) {
      void this.notifyCustomer(updatedOrder, mensajeCliente);
    }

    return this.toOrderResponse(updatedOrder);
  }

  async update(id: string, updateOrderDto: UpdateOrderDto, user: TenantUser) {
    if (updateOrderDto.status && Object.keys(updateOrderDto).length === 1) {
      return this.updateOrderStatus(id, updateOrderDto.status, user);
    }

    const existingOrder = await this.findOne(id, user);

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: {
        customerName: updateOrderDto.customerName,
        customerPhone:
          updateOrderDto.customerPhone === undefined ? undefined : normalizeColombianPhone(updateOrderDto.customerPhone),
        deliveryAddress: updateOrderDto.deliveryAddress,
        notes: updateOrderDto.notes,
        status: updateOrderDto.status,
      },
      include: {
        restaurant: true,
        items: {
          include: {
            menuItem: true,
          },
        },
      },
    });

    // 1. Emitir evento WebSocket de orden actualizada
    this.ordersGateway.emitOrderStatusUpdated(existingOrder.restaurantId, this.toOrderResponse(updatedOrder));

    // 2. Notificar al cliente vía WhatsApp si el estado cambió
    if (updateOrderDto.status && updateOrderDto.status !== existingOrder.status) {
      const mensajeCliente = this.buildStatusMessage(updateOrderDto.status);
      if (mensajeCliente) {
        void this.notifyCustomer(updatedOrder, mensajeCliente);
      }
    }

    return this.toOrderResponse(updatedOrder);
  }

  async remove(id: string, user: TenantUser) {
    await this.findOne(id, user);
    return await this.prisma.order.delete({
      where: { id },
    });
  }

  /** Quita las credenciales de Meta del restaurante incluido antes de responder/emitir */
  private toOrderResponse<T extends { restaurant: object }>(order: T) {
    return { ...order, restaurant: sanitizeRestaurant(order.restaurant) };
  }

  /** Mensaje de WhatsApp para el cliente según el nuevo estado (vacío = no se notifica) */
  private buildStatusMessage(status: OrderStatus, estimatedMinutes?: number): string {
    switch (status) {
      case OrderStatus.PREPARING:
        return estimatedMinutes
          ? `¡Tu pedido ya está en preparación! 👨‍🍳 Estará listo en aprox. ${estimatedMinutes} minutos.`
          : '👨‍🍳 ¡Buenas noticias! Tu pedido ya está en la cocina y lo estamos preparando con mucho cariño.';
      case OrderStatus.DELIVERED:
        return '🛵 ¡Tu pedido está listo y va en camino! Disfruta tu comida.';
      case OrderStatus.CANCELLED:
        return 'Hola, lamentamos informarte que tu pedido ha sido cancelado por el restaurante (posiblemente por falta de inventario). Te pedimos disculpas por los inconvenientes. 🙏';
      default:
        return '';
    }
  }

  /**
   * Notifica al cliente por el canal unificado: Meta Cloud API si el restaurante tiene
   * credenciales oficiales; si no, la sesión de WhatsApp Web (Baileys). Nunca lanza.
   * Público para otros módulos (ej. confirmación de pago de PaymentsService).
   */
  async notifyCustomer(
    order: {
      customerPhone?: string | null;
      restaurantId?: string | null;
      restaurant?: { whatsappPhoneId?: string | null; whatsappToken?: string | null } | null;
    },
    text: string,
  ): Promise<void> {
    if (!order.customerPhone) return;
    // También cubre pedidos guardados antes de normalizar el teléfono (ej. "3001234567")
    const customerPhone = normalizeColombianPhone(order.customerPhone);
    const phoneId = order.restaurant?.whatsappPhoneId || process.env.META_PHONE_NUMBER_ID || '';
    const token = order.restaurant?.whatsappToken || process.env.META_ACCESS_TOKEN || '';
    const viaMeta = Boolean(phoneId && token);

    if (!viaMeta && !order.restaurantId) return;

    try {
      // Baileys: la sesión de WhatsApp Web se identifica por el restaurantId
      await this.metaWhatsAppService.sendTextMessage(
        viaMeta ? phoneId : order.restaurantId!,
        token,
        customerPhone,
        text,
        !viaMeta,
      );
      this.logger.log(
        `Notificación de WhatsApp (${viaMeta ? 'Meta' : 'Baileys'}) enviada al cliente ${customerPhone}`,
      );
    } catch (error) {
      this.logger.error('Error enviando notificación al cliente:', error);
    }
  }
}
