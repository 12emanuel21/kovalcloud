import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsappGatewayController } from './whatsapp-gateway.controller';
import { WhatsappSessionSyncController } from './whatsapp-session-sync.controller';

@Module({
  imports: [AuthModule],
  controllers: [WhatsappGatewayController, WhatsappSessionSyncController],
})
export class WhatsappGatewayModule {}
