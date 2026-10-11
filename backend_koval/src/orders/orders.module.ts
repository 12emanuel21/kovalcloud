import { Module, forwardRef } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersGateway } from './orders.gateway';
import { MetaWhatsAppModule } from '../meta-whatsapp/meta-whatsapp.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [forwardRef(() => MetaWhatsAppModule), AuthModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersGateway],
  exports: [OrdersService, OrdersGateway],
})
export class OrdersModule {}
