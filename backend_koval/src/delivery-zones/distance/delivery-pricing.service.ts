import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DISTANCE_CALCULATOR, isValidGeoPoint, type GeoPoint, type IDistanceCalculator } from './distance-calculator.interface';
import { HaversineDistanceCalculator, roundKm } from './haversine-calculator.service';

/** Tarifa escalonada por distancia */
export interface DistancePricing {
  baseDeliveryFee: number;
  baseDeliveryKm: number;
  extraKmFee: number;
  maxDeliveryRadiusKm: number;
}

/**
 * Cotización por distancia. Es compatible con DeliveryQuote (zoneId null, zoneName con los km) para
 * que pedidos, carta y bot la usen igual que una zona.
 */
export type DistanceQuote =
  | {
      isCovered: true;
      distanceKm: number;
      deliveryFee: number;
      branchId: string | null;
      branchName: string | null;
      zoneId: null;
      zoneName: string;
      coverageConfigured: true;
    }
  | {
      isCovered: false;
      distanceKm: number;
      maxRadius: number;
      fallback: 'TAKEAWAY';
      branchId: string | null;
      deliveryFee: 0;
      coverageConfigured: true;
    };

/**
 * Valor del envío según la distancia:
 * - hasta baseDeliveryKm: la tarifa base;
 * - más allá: la base + cada km adicional INICIADO (3.1 km con base de 2 km = 2 km extra).
 * La diferencia se redondea a 1 decimal antes del techo para que el error de coma flotante
 * (3.1 - 2.1 = 1.0000000004) no cobre un km de más. Resultado en pesos enteros.
 */
export function distanceDeliveryFee(distanceKm: number, pricing: Pick<DistancePricing, 'baseDeliveryFee' | 'baseDeliveryKm' | 'extraKmFee'>): number {
  const base = Math.max(0, pricing.baseDeliveryFee);
  if (distanceKm <= pricing.baseDeliveryKm) return Math.round(base);
  const extraKm = Math.ceil(roundKm(distanceKm - pricing.baseDeliveryKm));
  return Math.round(base + extraKm * Math.max(0, pricing.extraKmFee));
}

/** Kilómetros para mostrar al cliente: "3,2" (formato colombiano, 1 decimal) */
export const formatKm = (km: number) => km.toLocaleString('es-CO', { maximumFractionDigits: 1 });

/** Texto de la "zona" en el desglose: "Domicilio (3,2 km)" */
export const distanceZoneName = (distanceKm: number) => `${formatKm(distanceKm)} km`;

type PricingFields = { [K in keyof DistancePricing]: number | null };
type BranchRow = PricingFields & { id: string; name: string; isMain: boolean; latitude: number | null; longitude: number | null };

interface Origin {
  point: GeoPoint;
  branchId: string | null;
  branchName: string | null;
  pricing: DistancePricing;
}

const PRICING_SELECT = { baseDeliveryFee: true, baseDeliveryKm: true, extraKmFee: true, maxDeliveryRadiusKm: true } as const;

/** Tarifa de la sede si la tiene; si no, la de la marca */
function mergePricing(brand: DistancePricing, branch?: Partial<PricingFields>): DistancePricing {
  const pick = (key: keyof DistancePricing) => {
    const value = branch?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : brand[key];
  };
  return {
    baseDeliveryFee: pick('baseDeliveryFee'),
    baseDeliveryKm: pick('baseDeliveryKm'),
    extraKmFee: pick('extraKmFee'),
    maxDeliveryRadiusKm: pick('maxDeliveryRadiusKm'),
  };
}

/**
 * Motor autónomo de tarificación por distancia (pin GPS del cliente). Sin coordenadas del local
 * ni de ninguna sede devuelve null: quien llama sigue con las zonas o la tarifa estándar.
 */
@Injectable()
export class DeliveryPricingService {
  private readonly calculator: IDistanceCalculator;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(DISTANCE_CALCULATOR) calculator?: IDistanceCalculator,
  ) {
    this.calculator = calculator ?? new HaversineDistanceCalculator();
  }

  /**
   * - Sedes activas con coordenadas: la más cercana que cubra al cliente (si se indica
   *   targetBranchId y esa sede tiene coordenadas, solo esa).
   * - Ninguna sede con coordenadas: las coordenadas del local (a nombre de la sede principal).
   * - Fuera del radio de todas: { isCovered: false, fallback: 'TAKEAWAY' } con la más cercana.
   */
  async calculateFee(restaurantId: string, customerCoords: GeoPoint, targetBranchId?: string | null): Promise<DistanceQuote | null> {
    if (!isValidGeoPoint(customerCoords)) return null;
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        latitude: true,
        longitude: true,
        ...PRICING_SELECT,
        branches: {
          where: { isActive: true },
          select: { id: true, name: true, isMain: true, latitude: true, longitude: true, ...PRICING_SELECT },
        },
      },
    });
    if (!restaurant) return null;

    const brand: DistancePricing = {
      baseDeliveryFee: restaurant.baseDeliveryFee,
      baseDeliveryKm: restaurant.baseDeliveryKm,
      extraKmFee: restaurant.extraKmFee,
      maxDeliveryRadiusKm: restaurant.maxDeliveryRadiusKm,
    };
    const origins = this.originsFor(restaurant, (restaurant.branches ?? []) as BranchRow[], brand, targetBranchId);
    if (origins.length === 0) return null;

    const measured = await Promise.all(
      origins.map(async (origin) => ({ origin, distanceKm: roundKm(await this.calculator.calculateDistance(origin.point, customerCoords)) })),
    );
    measured.sort((a, b) => a.distanceKm - b.distanceKm);

    const covering = measured.find(({ origin, distanceKm }) => distanceKm <= origin.pricing.maxDeliveryRadiusKm);
    if (!covering) {
      const nearest = measured[0];
      return {
        isCovered: false,
        distanceKm: nearest.distanceKm,
        maxRadius: nearest.origin.pricing.maxDeliveryRadiusKm,
        fallback: 'TAKEAWAY',
        branchId: nearest.origin.branchId,
        deliveryFee: 0,
        coverageConfigured: true,
      };
    }
    const { origin, distanceKm } = covering;
    return {
      isCovered: true,
      distanceKm,
      deliveryFee: distanceDeliveryFee(distanceKm, origin.pricing),
      branchId: origin.branchId,
      branchName: origin.branchName,
      zoneId: null,
      zoneName: distanceZoneName(distanceKm),
      coverageConfigured: true,
    };
  }

  private originsFor(
    restaurant: { latitude: number | null; longitude: number | null },
    branches: BranchRow[],
    brand: DistancePricing,
    targetBranchId?: string | null,
  ): Origin[] {
    const located = branches
      .map((branch) => ({ branch, point: { lat: branch.latitude, lng: branch.longitude } }))
      .filter((entry): entry is { branch: BranchRow; point: GeoPoint } => isValidGeoPoint(entry.point as Partial<GeoPoint>))
      .map(({ branch, point }) => ({ point, branchId: branch.id, branchName: branch.name, pricing: mergePricing(brand, branch) }));

    const target = targetBranchId ? located.filter((origin) => origin.branchId === targetBranchId) : [];
    if (target.length > 0) return target;
    if (located.length > 0) return located;

    // Sin sedes ubicadas: el punto del local, a nombre de la sede principal (si hay sedes)
    const point = { lat: restaurant.latitude, lng: restaurant.longitude };
    if (!isValidGeoPoint(point as Partial<GeoPoint>)) return [];
    const main = branches.find((branch) => branch.isMain) ?? null;
    return [{ point: point as GeoPoint, branchId: main?.id ?? null, branchName: main?.name ?? null, pricing: brand }];
  }
}
