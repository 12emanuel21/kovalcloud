import { Module, forwardRef } from '@nestjs/common';
import { MetaWhatsAppController } from './meta-whatsapp.controller';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [PrismaModule, AiModule, forwardRef(() => OrdersModule)],
  controllers: [MetaWhatsAppController],
  providers: [MetaWhatsAppService],
  exports: [MetaWhatsAppService],
})
export class MetaWhatsAppModule {}
