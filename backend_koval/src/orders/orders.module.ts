import { Module, forwardRef } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersGateway } from './orders.gateway';
import { MetaWhatsAppModule } from '../meta-whatsapp/meta-whatsapp.module';
import { AuthModule } from '../auth/auth.module';
import { WompiCheckoutModule } from '../payments/wompi-checkout.module';
import { DeliveryZonesModule } from '../delivery-zones/delivery-zones.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [forwardRef(() => MetaWhatsAppModule), AuthModule, WompiCheckoutModule, DeliveryZonesModule, CustomersModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersGateway],
  exports: [OrdersService, OrdersGateway],
})
export class OrdersModule {}
