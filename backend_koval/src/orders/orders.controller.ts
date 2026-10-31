import { Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { KitchenAccess } from '../auth/decorators/kitchen-access.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { DispatchOrderDto } from './dto/dispatch-order.dto';
import { orderViewFor } from './order-visibility';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // Público: los clientes hacen pedidos desde el menú web.
  // Limitado por IP para evitar inundaciones de pedidos falsos.
  @UseGuards(ThrottlerGuard)
  @Post()
  create(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.create(createOrderDto);
  }

  // Reporte contable .xlsx (?from=AAAA-MM-DD&to=AAAA-MM-DD, hora de Colombia; por defecto el mes en curso).
  // Datos financieros: solo OWNER o SUPERADMIN (la cocina queda fuera). Antes de ':id' para no confundirse.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.SUPERADMIN)
  @Get('export/excel')
  async exportExcel(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
    @Query('restaurantId') restaurantId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { buffer, filename } = await this.ordersService.exportExcel(user, restaurantId, from, to);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(buffer);
  }

  // A partir de aquí todo exige sesión y queda limitado al restaurante del usuario.
  // KITCHEN: solo ver pedidos y cambiar su estado (no editar datos ni borrar).
  @KitchenAccess()
  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser, @Query('restaurantId') restaurantId?: string) {
    // KITCHEN recibe los pedidos sin importes (total, precios, subtotales)
    return orderViewFor(user.role, await this.ordersService.findAll(user, restaurantId));
  }

  @KitchenAccess()
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return orderViewFor(user.role, await this.ordersService.findOne(id, user));
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDto,
  ) {
    return this.ordersService.update(id, updateOrderDto, user);
  }

  @KitchenAccess()
  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body('status') status: string,
    @Body('estimatedMinutes') estimatedMinutes?: number,
  ) {
    return orderViewFor(user.role, await this.ordersService.updateOrderStatus(id, status, user, estimatedMinutes));
  }

  // Despacho a domicilio desde el KDS: asigna repartidor y avisa por WhatsApp al cliente y al repartidor
  @KitchenAccess()
  @UseGuards(JwtAuthGuard)
  @Post(':id/dispatch')
  @HttpCode(HttpStatus.OK)
  async dispatch(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: DispatchOrderDto) {
    return orderViewFor(user.role, await this.ordersService.dispatch(id, dto, user));
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordersService.remove(id, user);
  }
}
