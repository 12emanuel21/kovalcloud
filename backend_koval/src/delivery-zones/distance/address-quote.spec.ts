import { DeliveryZonesService } from '../delivery-zones.service';
import { DeliveryPricingService } from './delivery-pricing.service';
import { HaversineDistanceCalculator, haversineKm } from './haversine-calculator.service';
import { OrdersService } from '../../orders/orders.service';

/**
 * Motor de cotización por distancia con dirección escrita (geocodificada). Hoy está DESCONECTADO de
 * los pedidos (el domicilio lo define el local en el Kanban); se conserva y se prueba por si se
 * reactiva. Geocodificador simulado (sin red) y motor Haversine real.
 */
const SEDE_1 = { id: 'sede-1', name: 'Sede 1 · Calle 30', isMain: true, latitude: 10.9639, longitude: -74.7964 };
const SEDE_2 = { id: 'sede-2', name: 'Sede 2 · Calle 84', isMain: false, latitude: 11.0045, longitude: -74.815 };
/** Cerca de la Sede 2 (Alto Prado) y cerca de la Sede 1 (Centro) */
const NEAR_SEDE_2 = { lat: 11.001, lng: -74.812 };
const NEAR_SEDE_1 = { lat: 10.9665, lng: -74.7935 };

const pricingFields = { baseDeliveryFee: 4000, baseDeliveryKm: 2, extraKmFee: 1500, maxDeliveryRadiusKm: 8 };
const branchPricing = { baseDeliveryFee: null, baseDeliveryKm: null, extraKmFee: null, maxDeliveryRadiusKm: null };

function build({ zones = [] as unknown[], defaultDeliveryFee = null as number | null, geocoded = null as unknown } = {}) {
  const restaurant = {
    id: 'rest-1',
    name: 'Betania Express',
    isTemporarilyClosed: false,
    businessHours: null,
    extendedUntil: null,
    latitude: null,
    longitude: null,
    defaultDeliveryFee,
    ...pricingFields,
    branches: [
      { ...SEDE_1, isActive: true, ...branchPricing },
      { ...SEDE_2, isActive: true, ...branchPricing },
    ],
  };
  const prisma: any = {
    restaurant: { findUnique: jest.fn().mockResolvedValue(restaurant) },
    deliveryZone: { findMany: jest.fn().mockResolvedValue(zones) },
  };
  const geocoder = { geocode: jest.fn().mockResolvedValue(geocoded) };
  const pricing = new DeliveryPricingService(prisma, new HaversineDistanceCalculator(), geocoder);
  const zonesService = new DeliveryZonesService(prisma, pricing);
  return { prisma, geocoder, zonesService };
}

describe('Cotización por distancia con la dirección escrita (sin pin)', () => {
  it('geocodifica la dirección y asigna la Sede 2 si es la más cercana', async () => {
    const { zonesService, geocoder } = build({ geocoded: NEAR_SEDE_2 });
    const quote = await zonesService.quoteForOrder('rest-1', 'DELIVERY', 'Alto Prado', 'Cra 52 # 76-10');

    // Sesgo hacia la ciudad del local: la sede principal
    expect(geocoder.geocode).toHaveBeenCalledWith('Cra 52 # 76-10', {
      bias: { lat: SEDE_1.latitude, lng: SEDE_1.longitude },
      neighborhood: 'Alto Prado',
    });
    expect(quote).toMatchObject({ isCovered: true, branchId: 'sede-2', branchName: 'Sede 2 · Calle 84', geocoded: true, zoneId: null });
    const km = Math.round(haversineKm(NEAR_SEDE_2, { lat: SEDE_2.latitude, lng: SEDE_2.longitude }) * 1.3 * 10) / 10;
    expect(quote!.distanceKm).toBe(km);
    expect(quote!.deliveryFee).toBe(4000); // dentro de los 2 km base
  });

  it('una dirección del centro sale de la Sede 1, con tarifa por km adicional si aplica', async () => {
    const { zonesService } = build({ geocoded: NEAR_SEDE_1 });
    const quote = await zonesService.quote('rest-1', { address: 'Calle 30 # 20-15', neighborhood: 'Centro' });
    expect(quote).toMatchObject({ isCovered: true, branchId: 'sede-1', geocoded: true });
  });

  it('con pin GPS válido manda el pin: la dirección no se geocodifica', async () => {
    const { zonesService, geocoder } = build({ geocoded: NEAR_SEDE_1 });
    const quote = await zonesService.quoteForOrder('rest-1', 'DELIVERY', 'Centro', 'Calle 30 # 20-15', NEAR_SEDE_2);
    expect(geocoder.geocode).not.toHaveBeenCalled();
    expect(quote).toMatchObject({ branchId: 'sede-2' });
    expect(quote).not.toHaveProperty('geocoded');
  });

  it('dirección ambigua (geocode null): tarifa por zonas del barrio, sin bloquear el pedido', async () => {
    const zone = { id: 'z-norte', name: 'Norte', keywords: ['Alto Prado'], fee: 6000, branchId: 'sede-2' };
    const { zonesService } = build({ zones: [zone], geocoded: null });
    await expect(zonesService.quoteForOrder('rest-1', 'DELIVERY', 'Alto Prado', 'una casa azul por el parque')).resolves.toMatchObject({
      isCovered: true,
      zoneId: 'z-norte',
      deliveryFee: 6000,
      branchId: 'sede-2',
    });
  });

  it('dirección ambigua sin zonas: tarifa estándar del local', async () => {
    const { zonesService } = build({ defaultDeliveryFee: 5000, geocoded: null });
    await expect(zonesService.quote('rest-1', { address: 'cerca del estadio' })).resolves.toMatchObject({
      isCovered: true,
      zoneName: 'Tarifa general',
      deliveryFee: 5000,
    });
  });

  it('geocodificada fuera del radio: no se rechaza si la tarifa estándar cubre (la ubicación es aproximada)', async () => {
    const far = { lat: 11.2, lng: -74.2 };
    const withDefault = build({ defaultDeliveryFee: 5000, geocoded: far });
    await expect(withDefault.zonesService.quote('rest-1', { address: 'Calle 10 # 1-1' })).resolves.toMatchObject({
      isCovered: true,
      deliveryFee: 5000,
    });
    // Sin nada que la cubra: fuera de cobertura con la distancia (y "Tu dirección", no "Tu ubicación")
    const zone = { id: 'z1', name: 'Norte', keywords: ['Riomar'], fee: 6000, branchId: null };
    const uncovered = build({ zones: [zone], geocoded: far });
    const quote = await uncovered.zonesService.quote('rest-1', { address: 'Calle 10 # 1-1', neighborhood: 'Otro' });
    expect(quote).toMatchObject({ isCovered: false, geocoded: true, fallback: 'TAKEAWAY' });
  });

});

describe('Pedido web con la dirección en texto: el motor de distancia ya no interviene', () => {
  it('no geocodifica ni cotiza: domicilio pendiente en la sede principal, sin distancia', async () => {
    const { prisma, geocoder } = build({ geocoded: NEAR_SEDE_2 });
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'o1', createdAt: new Date(), paymentReference: null, ...data }));
    prisma.menuItem = { findMany: jest.fn().mockResolvedValue([{ id: 'item-1', price: 20000 }]) };
    prisma.order = { count: jest.fn().mockResolvedValue(0) };
    prisma.$transaction = jest.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn({ order: { create } }));
    const customers: any = { safeTouch: jest.fn().mockResolvedValue({ id: 'cust-1' }) };
    const orders = new OrdersService(prisma, { emitNewOrder: jest.fn() } as any, {} as any, {} as any, customers);

    await orders.create({
      restaurantId: 'rest-1',
      customerName: 'Ana',
      customerPhone: '3001112233',
      orderType: 'DELIVERY',
      deliveryAddress: 'Cra 52 # 76-10 apto 302',
      neighborhood: 'Alto Prado',
      channel: 'WEB_MENU',
      acceptTerms: true,
      items: [{ menuItemId: 'item-1', quantity: 1 }],
    } as any);

    expect(geocoder.geocode).not.toHaveBeenCalled();
    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({ branchId: 'sede-1', deliveryFee: 0, deliveryFeePending: true, subtotal: 20000, total: 20000 });
    expect(data).not.toHaveProperty('deliveryDistanceKm');
    expect(data).not.toHaveProperty('customerLat');
  });
});
