import { Module, forwardRef } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersGateway } from './orders.gateway';
import { MetaWhatsAppModule } from '../meta-whatsapp/meta-whatsapp.module';

@Module({
  imports: [forwardRef(() => MetaWhatsAppModule)],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersGateway],
  exports: [OrdersService, OrdersGateway],
})
export class OrdersModule {}
