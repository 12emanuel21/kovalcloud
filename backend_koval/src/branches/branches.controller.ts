import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantParam } from '../auth/decorators/tenant-param.decorator';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

/** Sedes de la marca (Ajustes > Sedes): OWNER o SUPERADMIN del local */
@Controller('restaurants/:id/branches')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(Role.OWNER, Role.SUPERADMIN)
@TenantParam('id')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  list(@Param('id') restaurantId: string) {
    return this.branches.list(restaurantId);
  }

  @Post()
  create(@Param('id') restaurantId: string, @Body() dto: CreateBranchDto) {
    return this.branches.create(restaurantId, dto);
  }

  @Patch(':branchId')
  update(@Param('id') restaurantId: string, @Param('branchId') branchId: string, @Body() dto: UpdateBranchDto) {
    return this.branches.update(restaurantId, branchId, dto);
  }

  @Delete(':branchId')
  remove(@Param('id') restaurantId: string, @Param('branchId') branchId: string) {
    return this.branches.remove(restaurantId, branchId);
  }
}

/** Público (carta web): sedes activas para elegir dónde recoger el pedido */
@Controller('restaurants/:id/pickup-branches')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class PublicBranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  list(@Param('id') restaurantId: string) {
    return this.branches.listPublic(restaurantId);
  }
}
