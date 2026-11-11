/** Punto geográfico en grados decimales */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Calculadora de distancia de domicilio en km. Hoy Haversine con factor vial (sin APIs de pago);
 * mañana se puede cambiar por OSRM u otro motor de rutas registrando otra clase en
 * DISTANCE_CALCULATOR (delivery-zones.module), sin tocar la tarificación.
 */
export interface IDistanceCalculator {
  calculateDistance(origin: GeoPoint, destination: GeoPoint): Promise<number>;
}

/** Token de inyección de la calculadora de distancia */
export const DISTANCE_CALCULATOR = Symbol('DISTANCE_CALCULATOR');

/** Coordenadas utilizables: números finitos dentro del rango de latitud/longitud */
export function isValidGeoPoint(point: Partial<GeoPoint> | null | undefined): point is GeoPoint {
  return (
    !!point &&
    typeof point.lat === 'number' &&
    typeof point.lng === 'number' &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  );
}
