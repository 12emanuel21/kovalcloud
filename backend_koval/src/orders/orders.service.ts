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
import { OrderStatus, OrderType, Role } from '@prisma/client';
import { OrdersGateway } from './orders.gateway';
import { buildClosedNotice, isRestaurantClosed } from '../restaurants/business-hours';
import { assertTenantAccess, resolveTenantFilter, TenantUser } from '../auth/tenant-access';
import { sanitizeRestaurant } from '../restaurants/sanitize-restaurant';
import { isWompiReady, WompiCheckoutService } from '../payments/wompi-checkout.service';
import { normalizeColombianPhone } from './phone';
import { businessDayStart, dailyNumberOf, formatDailyNumber, withDailyNumbers } from './daily-number';
import { DispatchOrderDto } from './dto/dispatch-order.dto';
import { buildCustomerDispatchMessage, buildDriverDispatchMessage } from './dispatch-messages';
import { normalizeDriverPhone } from '../drivers/drivers.service';
import { buildOrdersWorkbook, exportFilename, resolveExportRange } from './orders-export';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { CustomersService } from '../customers/customers.service';
import { resolveOrderBranchId } from '../branches/branch-routing';

/**
 * Confirmación inicial por WhatsApp. Con `paymentUrl` adjunta el link de pago (plan B si el cliente
 * cierra el checkout); sin él (Wompi apagado o link fallido) solo confirma la recepción del pedido.
 */
export function buildPaymentLinkMessage(
  restaurantName: string,
  dailyNumber: number,
  total: number,
  paymentUrl: string | null,
): string {
  const received =
    `🧾 ¡Recibimos tu pedido ${formatDailyNumber(dailyNumber)} en ${restaurantName}! ` +
    `Total: $${total.toLocaleString('es-CO')} COP.`;
  if (!paymentUrl) return `${received}\n\nEl local te confirmará el pedido por este chat.`;
  return (
    `${received}\n\n` +
    `💳 Si no alcanzaste a pagar, puedes hacerlo aquí:\n${paymentUrl}\n\n` +
    'Apenas se confirme el pago te avisamos por este chat.'
  );
}

/** Datos del pedido que deciden por qué canal de WhatsApp sale un mensaje */
type RestaurantChannelOrder = {
  restaurantId?: string | null;
  restaurant?: { whatsappPhoneId?: string | null; whatsappToken?: string | null } | null;
};

/** today (por defecto) = tablero activo de la jornada; all = historial completo */
export const ORDER_LIST_SCOPES = ['today', 'all'] as const;
type OrderListScope = (typeof ORDER_LIST_SCOPES)[number];

/** Solo salen del tablero los pedidos que ya terminaron su recorrido */
const ARCHIVABLE_STATUSES: OrderStatus[] = [OrderStatus.DELIVERED, OrderStatus.CANCELLED];

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersGateway: OrdersGateway,
    @Inject(forwardRef(() => MetaWhatsAppService))
    private readonly metaWhatsAppService: MetaWhatsAppService,
    private readonly wompiCheckout: WompiCheckoutService,
    private readonly deliveryZones: DeliveryZonesService,
    private readonly customers: CustomersService,
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
      neighborhood,
      acceptTerms,
      notes,
      items,
      paymentMethod,
      branchId: requestedBranchId,
    } = createOrderDto;
    // Endpoint público: `status` y `unitPrice` del cliente se ignoran.
    // El pedido nace PENDING y los precios salen siempre de la base de datos.

    // 1. Validar que el restaurante exista (con sus sedes activas, para enrutar el pedido)
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { branches: { where: { isActive: true }, select: { id: true, isMain: true } } },
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
    // Interruptor manual del dueño: con la pasarela apagada no se cobra en línea aunque haya llaves
    if (payOnline && !restaurant.isWompiEnabled) {
      throw new BadRequestException(
        'El pago en línea está desactivado en este restaurante. Elige pago en efectivo / contra entrega.',
      );
    }
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

    // Agotados, borrados o ajenos al restaurante: se devuelven sus IDs para que el carrito
    // los quite y el cliente reconfirme (un carrito guardado puede quedar desactualizado)
    const foundIds = new Set(menuItems.map((m) => m.id));
    const unavailableItemIds = [...new Set(menuItemIds)].filter((id) => !foundIds.has(id));
    if (unavailableItemIds.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'ITEMS_UNAVAILABLE',
        message:
          unavailableItemIds.length === 1
            ? 'Uno de los productos de tu pedido ya no está disponible'
            : 'Algunos productos de tu pedido ya no están disponibles',
        unavailableItemIds,
      });
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

    // 3.5. Domicilio: flete según la zona de cobertura del barrio (recoger y mesa no pagan envío).
    //      Fuera de cobertura no se crea el pedido: la carta ofrece recoger en el local.
    const quote = await this.deliveryZones.quoteForOrder(restaurantId, orderType, neighborhood, deliveryAddress);
    if (quote && !quote.isCovered) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'OUT_OF_COVERAGE',
        message: 'Todavía no llegamos a tu barrio con domicilio. Puedes pedirlo para recoger en el local.',
        fallback: quote.fallback,
      });
    }
    const deliveryFee = quote?.deliveryFee ?? 0;
    const phone = normalizeColombianPhone(customerPhone);

    // 3.55. Sede que lo prepara: la de la zona (domicilio) o la elegida (recoger); si no, la principal.
    //       Sin sedes configuradas queda en null y todo funciona como un solo local.
    const branches = restaurant.branches ?? [];
    if (requestedBranchId && orderType !== OrderType.DELIVERY && !branches.some((b) => b.id === requestedBranchId)) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'BRANCH_UNAVAILABLE',
        message: 'La sede que elegiste no está disponible. Elige otra para recoger tu pedido.',
      });
    }
    const branchId = resolveOrderBranchId({ orderType, quote, requestedBranchId, branches });

    // 3.6. Cliente del local (teléfono único por restaurante) y su autorización de datos (Ley 1581)
    const customer = await this.customers.safeTouch(restaurantId, phone, {
      name: customerName,
      address: deliveryAddress,
      neighborhood,
      acceptTerms,
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
          customerPhone: phone,
          customerId: customer?.id,
          deliveryAddress,
          neighborhood: neighborhood?.trim() || undefined,
          notes,
          status: OrderStatus.PENDING,
          // total = productos + domicilio (el link de Wompi cobra el total)
          subtotal: calculatedTotal,
          deliveryFee,
          total: calculatedTotal + deliveryFee,
          deliveryZoneId: quote?.isCovered ? quote.zoneId : null,
          ...(branchId ? { branchId } : {}),
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
    if (payOnline && restaurant.isWompiEnabled) {
      try {
        const link = await this.wompiCheckout.generatePaymentLink(createdOrder, restaurant);
        wompiCheckoutUrl = link.url;
        order = { ...createdOrder, paymentReference: link.reference };
      } catch (error) {
        // El pedido ya existe: el cliente sigue por WhatsApp y el local cobra por otro medio
        this.logger.error(`No se pudo generar el link de Wompi del pedido ${createdOrder.id}:`, error);
      }
    }

    // Turno del día (#01, #02...): lo ven el cliente, el Kanban y el KDS
    const dailyNumber = await dailyNumberOf(this.prisma, order);

    // 5. Emitir evento WebSocket en tiempo real
    this.ordersGateway.emitNewOrder(restaurantId, { ...order, dailyNumber });

    // 6. Plan B por WhatsApp: si el cliente cierra el navegador, conserva el link de pago.
    // El link solo va con la pasarela encendida; si no se pudo generar, solo se confirma la recepción.
    if (payOnline) {
      void this.notifyCustomer(
        { customerPhone: order.customerPhone, restaurantId, restaurant },
        buildPaymentLinkMessage(
          restaurant.name,
          dailyNumber,
          order.total,
          restaurant.isWompiEnabled ? wompiCheckoutUrl : null,
        ),
      );
    }

    return { ...order, dailyNumber, wompiCheckoutUrl };
  }

  /** Todos los pedidos del local (o de todos, para el SUPERADMIN), con su turno del día */
  /**
   * Por defecto, el tablero activo (Kanban / KDS): pedidos de la jornada en curso (desde las 5:00,
   * hora del local) que no se archivaron. scope=all: todo el historial (KPIs del Centro de Mando).
   */
  async findAll(user: TenantUser, requestedRestaurantId?: string, scope?: string) {
    if (scope !== undefined && !ORDER_LIST_SCOPES.includes(scope as OrderListScope)) {
      throw new BadRequestException(`scope inválido. Valores permitidos: ${ORDER_LIST_SCOPES.join(', ')}`);
    }
    const restaurantId = resolveTenantFilter(user, requestedRestaurantId);
    const activeBoard = scope !== 'all';
    // La cocina de una sede solo ve los pedidos de su sede (el dueño ve todos)
    const kitchenBranchId = user.role === Role.KITCHEN ? user.branchId : null;
    const orders = await this.prisma.order.findMany({
      where: {
        ...(restaurantId ? { restaurantId } : {}),
        ...(kitchenBranchId ? { branchId: kitchenBranchId } : {}),
        ...(activeBoard ? { createdAt: { gte: businessDayStart(new Date()) } } : {}),
      },
      include: {
        items: {
          include: {
            menuItem: true,
          },
        },
        // Nombre de la sede para el badge del Kanban (multisede)
        branch: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // La lista trae todos los pedidos de cada jornada: se numeran en memoria. Los archivados se
    // cuentan para el turno (no corren la numeración) pero no salen en el tablero activo.
    const numbered = withDailyNumbers(orders);
    return activeBoard ? numbered.filter((order) => !order.archivedAt) : numbered;
  }

  /**
   * Reporte contable .xlsx de los pedidos del local entre dos fechas (hora de Colombia).
   * El SUPERADMIN debe indicar el restaurante: un reporte mezclando locales no sirve para contabilidad.
   */
  async exportExcel(user: TenantUser, requestedRestaurantId?: string, from?: string, to?: string) {
    const restaurantId = resolveTenantFilter(user, requestedRestaurantId);
    if (!restaurantId) throw new BadRequestException('Indica ?restaurantId= para exportar los pedidos de un local');
    const range = resolveExportRange(from, to);

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true, slug: true },
    });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');

    const orders = await this.prisma.order.findMany({
      where: { restaurantId, createdAt: { gte: range.start, lt: range.end } },
      select: {
        id: true,
        createdAt: true,
        customerName: true,
        customerPhone: true,
        orderType: true,
        tableNumber: true,
        deliveryAddress: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        paymentReference: true,
        total: true,
        items: { select: { quantity: true, menuItem: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      buffer: buildOrdersWorkbook(orders, range, restaurant.name),
      filename: exportFilename(restaurant.slug, range),
    };
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

    return { ...order, dailyNumber: await dailyNumberOf(this.prisma, order) };
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
    const response = await this.toOrderResponse(updatedOrder);
    this.ordersGateway.emitOrderStatusUpdated(updatedOrder.restaurantId, response);

    // 3. Notificar al cliente por WhatsApp según el nuevo estado (en segundo plano: no frena al KDS)
    const mensajeCliente = this.buildStatusMessage(status as OrderStatus, minutes, updatedOrder.orderType);
    if (mensajeCliente) {
      void this.notifyCustomer(updatedOrder, mensajeCliente);
    }

    return response;
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
    this.ordersGateway.emitOrderStatusUpdated(existingOrder.restaurantId, await this.toOrderResponse(updatedOrder));

    // 2. Notificar al cliente vía WhatsApp si el estado cambió
    if (updateOrderDto.status && updateOrderDto.status !== existingOrder.status) {
      const mensajeCliente = this.buildStatusMessage(updateOrderDto.status, undefined, updatedOrder.orderType);
      if (mensajeCliente) {
        void this.notifyCustomer(updatedOrder, mensajeCliente);
      }
    }

    return await this.toOrderResponse(updatedOrder);
  }

  async remove(id: string, user: TenantUser) {
    await this.findOne(id, user);
    return await this.prisma.order.delete({
      where: { id },
    });
  }

  /** Quita las credenciales de Meta del restaurante incluido y agrega el turno del día */
  private async toOrderResponse<T extends { id: string; restaurantId: string; createdAt: Date; restaurant: object }>(order: T) {
    return {
      ...order,
      restaurant: sanitizeRestaurant(order.restaurant),
      dailyNumber: await dailyNumberOf(this.prisma, order),
    };
  }

  /**
   * Mensaje de WhatsApp para el cliente según el nuevo estado (vacío = no se notifica).
   * "En camino" no sale de aquí: lo avisa el despacho (POST /orders/:id/dispatch) con el repartidor.
   */
  private buildStatusMessage(status: OrderStatus, estimatedMinutes?: number, orderType?: OrderType | string): string {
    switch (status) {
      case OrderStatus.PREPARING:
        return estimatedMinutes
          ? `¡Tu pedido ya está en preparación! 👨‍🍳 Estará listo en aprox. ${estimatedMinutes} minutos.`
          : '👨‍🍳 ¡Buenas noticias! Tu pedido ya está en la cocina y lo estamos preparando con mucho cariño.';
      case OrderStatus.DELIVERED:
        if (orderType === OrderType.TAKEAWAY) return '✅ ¡Tu pedido está listo para recoger! Te esperamos.';
        if (orderType === OrderType.DINE_IN) return '✅ ¡Tu pedido está listo! Disfruta tu comida.';
        return '✅ ¡Tu pedido está listo! Te avisamos por aquí cuando salga con el repartidor.';
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
  async notifyCustomer(order: RestaurantChannelOrder & { customerPhone?: string | null }, text: string): Promise<void> {
    if (!order.customerPhone) return;
    // También cubre pedidos guardados antes de normalizar el teléfono (ej. "3001234567")
    await this.sendViaRestaurantChannel(order, normalizeColombianPhone(order.customerPhone), text, 'cliente');
  }

  /**
   * Envía un WhatsApp por el canal del restaurante del pedido: Meta Cloud API si tiene credenciales
   * oficiales; si no, su sesión de WhatsApp Web (Baileys). Nunca lanza.
   */
  private async sendViaRestaurantChannel(order: RestaurantChannelOrder, to: string, text: string, who: string) {
    const phoneId = order.restaurant?.whatsappPhoneId || process.env.META_PHONE_NUMBER_ID || '';
    const token = order.restaurant?.whatsappToken || process.env.META_ACCESS_TOKEN || '';
    const viaMeta = Boolean(phoneId && token);

    if (!viaMeta && !order.restaurantId) return;

    try {
      // Baileys: la sesión de WhatsApp Web se identifica por el restaurantId
      await this.metaWhatsAppService.sendTextMessage(viaMeta ? phoneId : order.restaurantId!, token, to, text, !viaMeta);
      this.logger.log(`Notificación de WhatsApp (${viaMeta ? 'Meta' : 'Baileys'}) enviada al ${who} ${to}`);
    } catch (error) {
      this.logger.error(`Error enviando notificación al ${who}:`, error);
    }
  }

  /**
   * Despacho a domicilio desde el KDS: asigna el repartidor (registrado o con datos sueltos), deja el
   * pedido como entregado a reparto (DELIVERED, igual que "Entregar") y avisa por WhatsApp al cliente
   * (datos del repartidor + wa.me para escribirle) y al repartidor (dirección, platos y cobro).
   */
  async dispatch(orderId: string, dto: DispatchOrderDto, user: TenantUser) {
    const order = await this.findOne(orderId, user);
    if (order.orderType !== OrderType.DELIVERY) {
      throw new BadRequestException('Solo los pedidos a domicilio se despachan con repartidor');
    }
    if (order.status === OrderStatus.CANCELLED) throw new ConflictException('El pedido está cancelado');
    if (order.dispatchedAt) throw new ConflictException('El pedido ya fue despachado');

    const driver = await this.resolveDispatchDriver(order.restaurantId, dto);

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.DELIVERED,
        driverId: driver.id,
        driverName: driver.name,
        driverPhone: driver.phone,
        driverVehicle: driver.vehicle,
        dispatchedAt: new Date(),
      },
      include: { restaurant: true, items: { include: { menuItem: true } } },
    });

    const response = await this.toOrderResponse(updatedOrder);
    this.ordersGateway.emitOrderStatusUpdated(updatedOrder.restaurantId, response);

    // En segundo plano: el KDS no espera a WhatsApp
    const dispatchOrder = {
      ...updatedOrder,
      dailyNumber: response.dailyNumber,
      customerPhone: normalizeColombianPhone(updatedOrder.customerPhone),
    };
    const restaurantName = updatedOrder.restaurant.name;
    void this.notifyCustomer(
      updatedOrder,
      buildCustomerDispatchMessage(dispatchOrder, driver, restaurantName, dto.estimatedMinutes),
    );
    void this.sendViaRestaurantChannel(
      updatedOrder,
      driver.phone,
      buildDriverDispatchMessage(dispatchOrder, driver, restaurantName),
      'repartidor',
    );

    return response;
  }

  /**
   * El local valida un pago manual (comprobante de Nequi o transferencia recibido por WhatsApp):
   * marca el pedido como PAGADO, lo emite al Kanban y le confirma al cliente por WhatsApp.
   */
  async confirmManualPayment(orderId: string, user: TenantUser) {
    const order = await this.findOne(orderId, user);
    if (order.paymentStatus === 'PAID') throw new ConflictException('El pedido ya está marcado como pagado');
    if (order.status === OrderStatus.CANCELLED) throw new ConflictException('El pedido está cancelado');

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'PAID',
        // Contra entrega o sin método: el pago llegó por transferencia (comprobante)
        ...(!order.paymentMethod || order.paymentMethod === 'CASH' ? { paymentMethod: 'TRANSFERENCIA' } : {}),
      },
      include: { restaurant: true, items: { include: { menuItem: true } } },
    });
    const response = await this.toOrderResponse(updatedOrder);
    this.ordersGateway.emitOrderUpdated(updatedOrder.restaurantId, response);
    void this.notifyCustomer(
      updatedOrder,
      `✅ ¡Confirmamos tu pago del pedido ${formatDailyNumber(response.dailyNumber)}! Gracias 🙌`,
    );
    return response;
  }

  /**
   * "Entregado / Archivar": el pedido despachado (o cancelado) sale del Kanban activo. No se borra:
   * sigue en la BD, en el historial y en el reporte de Excel.
   */
  async archive(orderId: string, user: TenantUser) {
    const order = await this.findOne(orderId, user);
    if (!ARCHIVABLE_STATUSES.includes(order.status)) {
      throw new ConflictException('Solo se archivan pedidos despachados o cancelados');
    }
    if (order.archivedAt) return order;

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: { archivedAt: new Date() },
      include: { restaurant: true, items: { include: { menuItem: true } } },
    });
    const response = await this.toOrderResponse(updatedOrder);
    this.ordersGateway.emitOrderUpdated(updatedOrder.restaurantId, response);
    return response;
  }

  /** Repartidor activo del restaurante (driverId) o datos sueltos (nombre + celular) */
  private async resolveDispatchDriver(restaurantId: string, dto: DispatchOrderDto) {
    if (dto.driverId) {
      const driver = await this.prisma.deliveryDriver.findFirst({
        where: { id: dto.driverId, restaurantId, isActive: true },
        select: { id: true, name: true, phone: true, vehicleInfo: true },
      });
      if (!driver) throw new BadRequestException('Repartidor no encontrado o inactivo');
      return { id: driver.id, name: driver.name, phone: driver.phone, vehicle: driver.vehicleInfo };
    }
    const name = dto.driverName?.trim();
    if (!name || !dto.driverPhone?.trim()) {
      throw new BadRequestException('Elige un repartidor o indica su nombre y celular');
    }
    return { id: null, name, phone: normalizeDriverPhone(dto.driverPhone), vehicle: dto.vehicleInfo?.trim() || null };
  }
}
