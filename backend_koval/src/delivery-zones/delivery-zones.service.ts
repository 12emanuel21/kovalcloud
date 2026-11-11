import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { OrderType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeliveryZoneDto, UpdateDeliveryZoneDto } from './dto/delivery-zone.dto';
import { normalizePlace, quoteFor, usableDefaultFee, type DeliveryQuote } from './delivery-coverage';
import { assertBranchOf, branchData } from '../branches/branch-ownership';
import { DeliveryPricingService } from './distance/delivery-pricing.service';
import { isValidGeoPoint, type GeoPoint } from './distance/distance-calculator.interface';

const zoneSelect = { id: true, name: true, keywords: true, fee: true, isActive: true, branchId: true, createdAt: true } as const;

/** Palabras clave limpias y sin repetir (se guardan como las escribió el dueño, sin espacios extra) */
function cleanKeywords(keywords: string[] | undefined): string[] | undefined {
  if (keywords === undefined) return undefined;
  const seen = new Set<string>();
  return keywords
    .map((k) => k.trim().replace(/\s+/g, ' '))
    .filter((k) => {
      const key = normalizePlace(k);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Tarifa redondeada a pesos (sin centavos) */
const cleanFee = (fee: number | undefined) => (fee === undefined ? undefined : Math.round(fee));

/**
 * Zonas de cobertura y tarifas de domicilio del restaurante (Ajustes > Domicilios).
 * El acceso lo valida TenantGuard en el controlador; aquí cada operación filtra por restaurantId.
 */
@Injectable()
export class DeliveryZonesService {
  private readonly pricing: DeliveryPricingService;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() pricing?: DeliveryPricingService,
  ) {
    this.pricing = pricing ?? new DeliveryPricingService(prisma);
  }

  list(restaurantId: string) {
    return this.prisma.deliveryZone.findMany({
      where: { restaurantId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: zoneSelect,
    });
  }

  /** Zonas activas y tarifa estándar para la carta: nombre y tarifa (las palabras clave son internas) */
  async publicCoverage(restaurantId: string) {
    const [zones, restaurant] = await Promise.all([
      this.prisma.deliveryZone.findMany({
        where: { restaurantId, isActive: true },
        orderBy: { name: 'asc' },
        select: { name: true, fee: true },
      }),
      this.prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { defaultDeliveryFee: true } }),
    ]);
    const defaultDeliveryFee = usableDefaultFee(restaurant?.defaultDeliveryFee);
    return { coverageConfigured: zones.length > 0 || defaultDeliveryFee !== null, zones, defaultDeliveryFee };
  }

  async create(restaurantId: string, dto: CreateDeliveryZoneDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('El nombre de la zona es obligatorio');
    await assertBranchOf(this.prisma, restaurantId, dto.branchId);
    return this.prisma.deliveryZone.create({
      data: {
        restaurantId,
        name,
        keywords: cleanKeywords(dto.keywords) ?? [],
        fee: cleanFee(dto.fee)!,
        ...branchData(dto.branchId),
      },
      select: zoneSelect,
    });
  }

  async update(restaurantId: string, zoneId: string, dto: UpdateDeliveryZoneDto) {
    await this.assertOwned(restaurantId, zoneId);
    const name = dto.name === undefined ? undefined : dto.name.trim();
    if (name === '') throw new BadRequestException('El nombre de la zona es obligatorio');
    await assertBranchOf(this.prisma, restaurantId, dto.branchId);
    return this.prisma.deliveryZone.update({
      where: { id: zoneId },
      data: {
        name,
        keywords: cleanKeywords(dto.keywords),
        fee: cleanFee(dto.fee),
        isActive: dto.isActive,
        ...branchData(dto.branchId),
      },
      select: zoneSelect,
    });
  }

  /** Los pedidos ya cobrados conservan su flete (deliveryZoneId queda en null) */
  async remove(restaurantId: string, zoneId: string) {
    await this.assertOwned(restaurantId, zoneId);
    await this.prisma.deliveryZone.delete({ where: { id: zoneId } });
    return { deleted: true };
  }

  /**
   * Flete según el barrio o la dirección: 1) zona activa que coincida; 2) tarifa estándar del local
   * ("Tarifa general"); 3) con zonas y sin tarifa estándar: { isCovered: false, fallback: 'TAKEAWAY' }.
   * Un local sin zonas ni tarifa estándar no restringe (cubierto, flete 0, coverageConfigured: false).
   */
  async calculateDeliveryFee(restaurantId: string, ...places: Array<string | null | undefined>): Promise<DeliveryQuote> {
    const [zones, restaurant] = await Promise.all([
      this.prisma.deliveryZone.findMany({
        where: { restaurantId, isActive: true },
        select: { id: true, name: true, keywords: true, fee: true, branchId: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { defaultDeliveryFee: true } }),
    ]);
    return quoteFor(zones, restaurant?.defaultDeliveryFee, ...places);
  }

  /**
   * Cotización completa: con pin GPS del cliente y el local (o una sede) ubicado, por distancia
   * (Haversine x 1.30, tarifa escalonada). Sin pin o sin coordenadas del local: zonas y tarifa
   * estándar, como siempre.
   */
  async quote(
    restaurantId: string,
    places: { neighborhood?: string | null; address?: string | null },
    customerCoords?: GeoPoint | null,
    targetBranchId?: string | null,
  ): Promise<DeliveryQuote> {
    if (isValidGeoPoint(customerCoords)) {
      const byDistance = await this.pricing.calculateFee(restaurantId, customerCoords, targetBranchId);
      if (byDistance) return byDistance;
    }
    return this.calculateDeliveryFee(restaurantId, places.neighborhood, places.address);
  }

  /** Flete de un pedido: solo los domicilios pagan envío (recoger y mesa: 0) */
  async quoteForOrder(
    restaurantId: string,
    orderType: OrderType | string | null | undefined,
    neighborhood?: string | null,
    address?: string | null,
    customerCoords?: GeoPoint | null,
  ): Promise<DeliveryQuote | null> {
    if ((orderType ?? OrderType.DELIVERY) !== OrderType.DELIVERY) return null;
    return this.quote(restaurantId, { neighborhood, address }, customerCoords);
  }

  private async assertOwned(restaurantId: string, zoneId: string) {
    const zone = await this.prisma.deliveryZone.findFirst({ where: { id: zoneId, restaurantId }, select: { id: true } });
    if (!zone) throw new NotFoundException('Zona no encontrada');
  }
}
