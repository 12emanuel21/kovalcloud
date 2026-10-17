import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantParam } from '../auth/decorators/tenant-param.decorator';
import { ChatsService } from './chats.service';

/**
 * Inbox de WhatsApp del restaurante. Solo el OWNER de este local (TenantGuard)
 * o el SUPERADMIN (incluido el Modo Dios); KITCHEN queda fuera.
 */
@Controller('restaurants/:id/chats')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(Role.OWNER, Role.SUPERADMIN)
@TenantParam('id')
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get()
  listConversations(@Param('id') restaurantId: string) {
    return this.chatsService.listConversations(restaurantId);
  }

  @Get(':phone')
  getConversation(@Param('id') restaurantId: string, @Param('phone') phone: string) {
    return this.chatsService.getConversation(restaurantId, phone);
  }
}
