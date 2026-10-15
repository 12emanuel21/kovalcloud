import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UsersService } from './users.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

/** Gestión del equipo del restaurante: solo OWNER y SUPERADMIN (KITCHEN queda fuera) */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.SUPERADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('restaurantId') restaurantId?: string) {
    return this.usersService.listEmployees(user, restaurantId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    // transform: aplica los @Transform del DTO (trim y email en minúsculas)
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: CreateEmployeeDto,
  ) {
    return this.usersService.createEmployee(user, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.usersService.updateStatus(user, id, dto.isActive);
  }
}
