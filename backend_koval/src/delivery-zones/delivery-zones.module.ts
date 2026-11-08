import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DeliveryCoverageController, DeliveryZonesController } from './delivery-zones.controller';
import { DeliveryZonesService } from './delivery-zones.service';

@Module({
  imports: [AuthModule],
  controllers: [DeliveryZonesController, DeliveryCoverageController],
  providers: [DeliveryZonesService],
  exports: [DeliveryZonesService],
})
export class DeliveryZonesModule {}
