import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { SUDO_HEADER } from '../auth/sudo';

/** Panel de plataforma: exclusivo del SUPERADMIN (todo el controlador) */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('restaurants')
  findAllRestaurants() {
    return this.adminService.findAllRestaurants();
  }

  // Soporte global: los cambios de estado/prioridad usan PATCH /restaurants/:id/tickets/:ticketId
  @Get('tickets')
  findAllTickets() {
    return this.adminService.findAllTickets();
  }

  @Post('restaurants')
  // transform: aplica los @Transform del DTO (trim, slug y email en minúsculas) solo en este endpoint
  createRestaurant(@Body(new ValidationPipe({ whitelist: true, transform: true })) dto: CreateTenantDto) {
    return this.adminService.createRestaurant(dto);
  }

  // Nombre, email y/o contraseña del dueño. Con 2FA activo en el SUPERADMIN exige Sudo Mode
  @Patch('restaurants/:id/owner')
  updateOwner(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) restaurantId: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: UpdateOwnerDto,
    @Headers(SUDO_HEADER) sudoToken?: string,
  ) {
    return this.adminService.updateOwner(restaurantId, dto, { user, sudoToken });
  }
}
