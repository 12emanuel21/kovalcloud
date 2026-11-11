import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DeliveryCoverageController, DeliveryZonesController } from './delivery-zones.controller';
import { DeliveryZonesService } from './delivery-zones.service';
import { DeliveryPricingService } from './distance/delivery-pricing.service';
import { HaversineDistanceCalculator } from './distance/haversine-calculator.service';
import { DISTANCE_CALCULATOR } from './distance/distance-calculator.interface';

@Module({
  imports: [AuthModule],
  controllers: [DeliveryZonesController, DeliveryCoverageController],
  providers: [
    DeliveryZonesService,
    DeliveryPricingService,
    // Hoy Haversine con factor vial; para OSRM basta con registrar otra clase aquí
    { provide: DISTANCE_CALCULATOR, useClass: HaversineDistanceCalculator },
  ],
  exports: [DeliveryZonesService, DeliveryPricingService],
})
export class DeliveryZonesModule {}
