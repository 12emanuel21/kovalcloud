import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { WompiCheckoutModule } from './wompi-checkout.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [OrdersModule, WompiCheckoutModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
