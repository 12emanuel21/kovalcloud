import { Module } from '@nestjs/common';
import { WompiCheckoutService } from './wompi-checkout.service';

/** Solo el link de pago (sin dependencias de pedidos): lo importan OrdersModule y PaymentsModule */
@Module({
  providers: [WompiCheckoutService],
  exports: [WompiCheckoutService],
})
export class WompiCheckoutModule {}
