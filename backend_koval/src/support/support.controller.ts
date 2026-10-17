import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantParam } from '../auth/decorators/tenant-param.decorator';
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';

/**
 * Tickets de soporte interno del restaurante. Solo el OWNER de este local (TenantGuard)
 * o el SUPERADMIN (incluido el Modo Dios); KITCHEN queda fuera.
 */
@Controller('restaurants/:id/tickets')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(Role.OWNER, Role.SUPERADMIN)
@TenantParam('id')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get()
  listTickets(@Param('id') restaurantId: string) {
    return this.supportService.listTickets(restaurantId);
  }

  @Post()
  createTicket(@Param('id') restaurantId: string, @Body() dto: CreateTicketDto) {
    return this.supportService.createTicket(restaurantId, dto);
  }

  @Patch(':ticketId')
  updateTicket(
    @Param('id') restaurantId: string,
    @Param('ticketId') ticketId: string,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.supportService.updateTicket(restaurantId, ticketId, dto);
  }
}
