import { Body, Controller, Get, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { CreateTenantDto } from './dto/create-tenant.dto';

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

  @Post('restaurants')
  // transform: aplica los @Transform del DTO (trim, slug y email en minúsculas) solo en este endpoint
  createRestaurant(@Body(new ValidationPipe({ whitelist: true, transform: true })) dto: CreateTenantDto) {
    return this.adminService.createRestaurant(dto);
  }
}
