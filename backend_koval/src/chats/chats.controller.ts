import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantParam } from '../auth/decorators/tenant-param.decorator';
import { ChatsService } from './chats.service';
import { SendChatMessageDto, SetHandoverDto } from './dto/chat-actions.dto';

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

  /** Bot activo / pausado (handover humano) y canal de envío */
  @Get(':phone/status')
  getStatus(@Param('id') restaurantId: string, @Param('phone') phone: string) {
    return this.chatsService.getStatus(restaurantId, phone);
  }

  /** Mensaje manual al cliente desde el panel (pausa el bot de esa conversación) */
  @Post(':phone/messages')
  sendMessage(@Param('id') restaurantId: string, @Param('phone') phone: string, @Body() dto: SendChatMessageDto) {
    return this.chatsService.sendManualMessage(restaurantId, phone, dto.text);
  }

  @Patch(':phone/handover')
  @HttpCode(HttpStatus.OK)
  setHandover(@Param('id') restaurantId: string, @Param('phone') phone: string, @Body() dto: SetHandoverDto) {
    return this.chatsService.setBotPaused(restaurantId, phone, dto.botPaused);
  }
}
