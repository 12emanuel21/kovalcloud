import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsappGatewayController } from './whatsapp-gateway.controller';

@Module({
  imports: [AuthModule],
  controllers: [WhatsappGatewayController],
})
export class WhatsappGatewayModule {}
