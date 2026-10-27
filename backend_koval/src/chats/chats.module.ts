import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MetaWhatsAppModule } from '../meta-whatsapp/meta-whatsapp.module';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';

@Module({
  // MetaWhatsAppModule: envío manual por Meta Cloud API o la sesión Baileys del local
  imports: [AuthModule, MetaWhatsAppModule],
  controllers: [ChatsController],
  providers: [ChatsService],
})
export class ChatsModule {}
