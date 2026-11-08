import { Module, forwardRef } from '@nestjs/common';
import { MetaWhatsAppController } from './meta-whatsapp.controller';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { OrdersModule } from '../orders/orders.module';
import { DeliveryZonesModule } from '../delivery-zones/delivery-zones.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [PrismaModule, AiModule, forwardRef(() => OrdersModule), DeliveryZonesModule, CustomersModule],
  controllers: [MetaWhatsAppController],
  providers: [MetaWhatsAppService],
  exports: [MetaWhatsAppService],
})
export class MetaWhatsAppModule {}
