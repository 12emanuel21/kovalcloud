import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantParam } from '../auth/decorators/tenant-param.decorator';
import { KitchenAccess } from '../auth/decorators/kitchen-access.decorator';
import { DriversService } from './drivers.service';
import { CreateDriverDto, UpdateDriverDto } from './dto/driver.dto';

/**
 * Domiciliarios del restaurante (Ajustes > Repartidores). TenantGuard valida :id.
 * Gestionarlos: OWNER o SUPERADMIN. Listarlos: también la cocina (modal de despacho del KDS).
 */
@Controller('restaurants/:id/drivers')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(Role.OWNER, Role.SUPERADMIN)
@TenantParam('id')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  /** ?active=true: solo los activos (los que ofrece el KDS) */
  @Get()
  @KitchenAccess()
  @Roles(Role.OWNER, Role.SUPERADMIN, Role.KITCHEN)
  list(@Param('id') restaurantId: string, @Query('active') active?: string) {
    return this.driversService.list(restaurantId, active === 'true');
  }

  @Post()
  create(@Param('id') restaurantId: string, @Body() dto: CreateDriverDto) {
    return this.driversService.create(restaurantId, dto);
  }

  @Patch(':driverId')
  update(@Param('id') restaurantId: string, @Param('driverId') driverId: string, @Body() dto: UpdateDriverDto) {
    return this.driversService.update(restaurantId, driverId, dto);
  }

  @Delete(':driverId')
  remove(@Param('id') restaurantId: string, @Param('driverId') driverId: string) {
    return this.driversService.remove(restaurantId, driverId);
  }
}
