import { UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
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
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

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

  // A partir de aquí todo exige sesión y queda limitado al restaurante del usuario
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('restaurantId') restaurantId?: string) {
    return this.ordersService.findAll(user, restaurantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordersService.findOne(id, user);
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

  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body('status') status: string,
    @Body('estimatedMinutes') estimatedMinutes?: number,
  ) {
    return this.ordersService.updateOrderStatus(id, status, user, estimatedMinutes);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordersService.remove(id, user);
  }
}
