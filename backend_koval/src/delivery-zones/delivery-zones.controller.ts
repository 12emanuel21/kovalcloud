import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantParam } from '../auth/decorators/tenant-param.decorator';
import { DeliveryZonesService } from './delivery-zones.service';
import { CreateDeliveryZoneDto, UpdateDeliveryZoneDto } from './dto/delivery-zone.dto';

/** Zonas y tarifas de domicilio (Ajustes > Domicilios): OWNER o SUPERADMIN del local */
@Controller('restaurants/:id/delivery-zones')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(Role.OWNER, Role.SUPERADMIN)
@TenantParam('id')
export class DeliveryZonesController {
  constructor(private readonly zones: DeliveryZonesService) {}

  @Get()
  list(@Param('id') restaurantId: string) {
    return this.zones.list(restaurantId);
  }

  @Post()
  create(@Param('id') restaurantId: string, @Body() dto: CreateDeliveryZoneDto) {
    return this.zones.create(restaurantId, dto);
  }

  @Patch(':zoneId')
  update(@Param('id') restaurantId: string, @Param('zoneId') zoneId: string, @Body() dto: UpdateDeliveryZoneDto) {
    return this.zones.update(restaurantId, zoneId, dto);
  }

  @Delete(':zoneId')
  remove(@Param('id') restaurantId: string, @Param('zoneId') zoneId: string) {
    return this.zones.remove(restaurantId, zoneId);
  }
}

/**
 * Público (carta web): zonas activas y cotización del flete antes de pedir. Limitado por IP, con
 * más margen que POST /orders: la carta cotiza mientras el cliente escribe su barrio.
 */
@Controller('restaurants/:id/delivery-coverage')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class DeliveryCoverageController {
  constructor(private readonly zones: DeliveryZonesService) {}

  @Get()
  coverage(@Param('id') restaurantId: string) {
    return this.zones.publicCoverage(restaurantId);
  }

  /** ?neighborhood=Riomar&address=Cra 52 # 76-10 */
  @Get('quote')
  quote(
    @Param('id') restaurantId: string,
    @Query('neighborhood') neighborhood?: string,
    @Query('address') address?: string,
  ) {
    return this.zones.calculateDeliveryFee(restaurantId, neighborhood?.slice(0, 200), address?.slice(0, 300));
  }
}
