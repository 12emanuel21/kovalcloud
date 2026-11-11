import { Injectable } from '@nestjs/common';
import type { GeoPoint, IDistanceCalculator } from './distance-calculator.interface';

/** Radio medio de la Tierra (km) */
const EARTH_RADIUS_KM = 6371;

/**
 * Factor vial: las calles no van en línea recta. La distancia en línea recta se multiplica por 1.30
 * para estimar el recorrido real de la moto en una ciudad con cuadrícula.
 */
export const ROAD_FACTOR = 1.3;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Redondeo a 1 decimal (3.04 -> 3, 3.05 -> 3.1) */
export const roundKm = (km: number) => Math.round(km * 10) / 10;

/** Distancia en línea recta (gran círculo) entre dos puntos, en km, sin redondear */
export function haversineKm(origin: GeoPoint, destination: GeoPoint): number {
  const dLat = toRadians(destination.lat - origin.lat);
  const dLng = toRadians(destination.lng - origin.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(origin.lat)) * Math.cos(toRadians(destination.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Distancia vial estimada (Haversine x 1.30), redondeada a 1 decimal. Sin APIs externas */
@Injectable()
export class HaversineDistanceCalculator implements IDistanceCalculator {
  calculateDistance(origin: GeoPoint, destination: GeoPoint): Promise<number> {
    return Promise.resolve(roundKm(haversineKm(origin, destination) * ROAD_FACTOR));
  }
}
