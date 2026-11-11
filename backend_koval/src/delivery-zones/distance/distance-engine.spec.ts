import { HaversineDistanceCalculator, haversineKm, ROAD_FACTOR, roundKm } from './haversine-calculator.service';
import { DeliveryPricingService, distanceDeliveryFee, formatKm } from './delivery-pricing.service';
import { isValidGeoPoint } from './distance-calculator.interface';
import { DeliveryZonesService } from '../delivery-zones.service';

const PRICING = { baseDeliveryFee: 4000, baseDeliveryKm: 2, extraKmFee: 1500, maxDeliveryRadiusKm: 8 };

describe('Motor de domicilio por distancia', () => {
  describe('Haversine + factor vial 1.30', () => {
    it('1 grado de latitud ≈ 111,2 km en línea recta; el mismo punto, 0', () => {
      expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.195, 2);
      expect(haversineKm({ lat: 10.98, lng: -74.8 }, { lat: 10.98, lng: -74.8 })).toBe(0);
    });

    it('es simétrico y la calculadora aplica x1.30 redondeado a 1 decimal', async () => {
      const a = { lat: 10.9878, lng: -74.7889 };
      const b = { lat: 11.0041, lng: -74.807 };
      expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
      const calc = new HaversineDistanceCalculator();
      const road = await calc.calculateDistance(a, b);
      expect(road).toBe(roundKm(haversineKm(a, b) * ROAD_FACTOR));
      expect(road).toBe(Number(road.toFixed(1)));
      expect(ROAD_FACTOR).toBe(1.3);
      await expect(calc.calculateDistance({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).resolves.toBe(144.6);
    });

    it('valida coordenadas (rango y números finitos)', () => {
      expect(isValidGeoPoint({ lat: 10.98, lng: -74.8 })).toBe(true);
      expect(isValidGeoPoint({ lat: 91, lng: 0 })).toBe(false);
      expect(isValidGeoPoint({ lat: 0, lng: -181 })).toBe(false);
      expect(isValidGeoPoint({ lat: Number.NaN, lng: 0 })).toBe(false);
      expect(isValidGeoPoint(null)).toBe(false);
    });
  });

  describe('tarifa escalonada', () => {
    it('hasta la distancia base: la tarifa base', () => {
      expect(distanceDeliveryFee(0.4, PRICING)).toBe(4000);
      expect(distanceDeliveryFee(2, PRICING)).toBe(4000);
    });

    it('cada km adicional iniciado suma el valor del km extra', () => {
      expect(distanceDeliveryFee(2.1, PRICING)).toBe(5500); // ceil(0.1) = 1
      expect(distanceDeliveryFee(3, PRICING)).toBe(5500); // ceil(1) = 1
      expect(distanceDeliveryFee(3.1, PRICING)).toBe(7000); // ceil(1.1) = 2
      expect(distanceDeliveryFee(7.9, PRICING)).toBe(13000); // ceil(5.9) = 6
    });

    it('el error de coma flotante no cobra un km de más (2,2 - 1,2 = 1 km, no 2)', () => {
      expect(2.2 - 1.2).toBeGreaterThan(1); // 1.0000000000000002 en coma flotante
      expect(distanceDeliveryFee(2.2, { ...PRICING, baseDeliveryKm: 1.2 })).toBe(5500);
      expect(distanceDeliveryFee(4.4, { ...PRICING, baseDeliveryKm: 2.4 })).toBe(7000);
    });

    it('formato colombiano de los km', () => {
      expect(formatKm(3.2)).toBe('3,2');
      expect(formatKm(4)).toBe('4');
    });
  });

  describe('DeliveryPricingService.calculateFee', () => {
    // Distancias fijas por sede para no depender de coordenadas reales
    const fixedCalculator = (byLat: Record<number, number>) => ({
      calculateDistance: jest.fn((origin: { lat: number }) => Promise.resolve(byLat[origin.lat])),
    });
    const build = (restaurant: Record<string, unknown>, byLat: Record<number, number>) => {
      const prisma: any = { restaurant: { findUnique: jest.fn().mockResolvedValue(restaurant) } };
      const calculator = fixedCalculator(byLat);
      return { prisma, calculator, service: new DeliveryPricingService(prisma, calculator) };
    };
    const brand = { latitude: null, longitude: null, ...PRICING, branches: [] as unknown[] };
    const branch = (id: string, lat: number, extra: Record<string, unknown> = {}) => ({
      id,
      name: `Sede ${id}`,
      isMain: id === 'b-30',
      latitude: lat,
      longitude: -74.8,
      baseDeliveryFee: null,
      baseDeliveryKm: null,
      extraKmFee: null,
      maxDeliveryRadiusKm: null,
      ...extra,
    });
    const customer = { lat: 10.99, lng: -74.81 };

    it('elige la sede más cercana al cliente y cobra con la tarifa de la marca', async () => {
      const { service, prisma } = build({ ...brand, branches: [branch('b-30', 1), branch('b-60', 2)] }, { 1: 5.4, 2: 1.8 });
      await expect(service.calculateFee('rest-1', customer)).resolves.toEqual({
        isCovered: true,
        distanceKm: 1.8,
        deliveryFee: 4000,
        branchId: 'b-60',
        branchName: 'Sede b-60',
        zoneId: null,
        zoneName: '1,8 km',
        coverageConfigured: true,
      });
      expect(prisma.restaurant.findUnique.mock.calls[0][0].select.branches.where).toEqual({ isActive: true });
    });

    it('fuera del radio máximo: no cubierto, con la distancia, el radio y el fallback a recoger', async () => {
      const { service } = build({ ...brand, branches: [branch('b-30', 1), branch('b-60', 2)] }, { 1: 9.5, 2: 12 });
      await expect(service.calculateFee('rest-1', customer)).resolves.toEqual({
        isCovered: false,
        distanceKm: 9.5,
        maxRadius: 8,
        fallback: 'TAKEAWAY',
        branchId: 'b-30',
        deliveryFee: 0,
        coverageConfigured: true,
      });
    });

    it('la sede cercana fuera de su radio cede a otra más lejana que sí cubre', async () => {
      const restaurant = {
        ...brand,
        branches: [branch('b-30', 1, { maxDeliveryRadiusKm: 3 }), branch('b-60', 2, { maxDeliveryRadiusKm: 10 })],
      };
      const { service } = build(restaurant, { 1: 3.5, 2: 6 });
      await expect(service.calculateFee('rest-1', customer)).resolves.toMatchObject({ isCovered: true, branchId: 'b-60', distanceKm: 6 });
    });

    it('la tarifa propia de la sede reemplaza la de la marca solo en los campos que tiene', async () => {
      const restaurant = { ...brand, branches: [branch('b-30', 1, { baseDeliveryFee: 5000, extraKmFee: 2000 })] };
      const { service } = build(restaurant, { 1: 3.5 });
      // base 5000 (sede) + ceil(3.5 - 2) = 2 km x 2000 (sede); base km 2 de la marca
      await expect(service.calculateFee('rest-1', customer)).resolves.toMatchObject({ deliveryFee: 9000 });
    });

    it('targetBranchId: calcula desde esa sede aunque otra esté más cerca', async () => {
      const { service } = build({ ...brand, branches: [branch('b-30', 1), branch('b-60', 2)] }, { 1: 4, 2: 1 });
      await expect(service.calculateFee('rest-1', customer, 'b-30')).resolves.toMatchObject({ branchId: 'b-30', distanceKm: 4 });
    });

    it('sin sedes ubicadas: usa las coordenadas del local a nombre de la sede principal', async () => {
      const restaurant = { ...brand, latitude: 7, longitude: -74.8, branches: [{ ...branch('b-30', 0), latitude: null }] };
      const { service } = build(restaurant, { 7: 2.4 });
      await expect(service.calculateFee('rest-1', customer)).resolves.toMatchObject({
        isCovered: true,
        branchId: 'b-30',
        deliveryFee: 5500,
      });
    });

    it('sin coordenadas en ningún lado o con un pin inválido: null (siguen las zonas)', async () => {
      const { service, calculator } = build({ ...brand, branches: [] }, {});
      await expect(service.calculateFee('rest-1', customer)).resolves.toBeNull();
      await expect(service.calculateFee('rest-1', { lat: 200, lng: 0 })).resolves.toBeNull();
      expect(calculator.calculateDistance).not.toHaveBeenCalled();
    });
  });

  describe('integración con la cotización de domicilios', () => {
    const zones = [{ id: 'z1', name: 'Norte', keywords: ['riomar'], fee: 6000, branchId: null }];
    const build = (distance: unknown) => {
      const prisma: any = {
        deliveryZone: { findMany: jest.fn().mockResolvedValue(zones) },
        restaurant: { findUnique: jest.fn().mockResolvedValue({ defaultDeliveryFee: null }) },
      };
      const pricing: any = { calculateFee: jest.fn().mockResolvedValue(distance) };
      return { pricing, service: new DeliveryZonesService(prisma, pricing) };
    };

    it('con pin y local ubicado manda la distancia', async () => {
      const byDistance = { isCovered: true, distanceKm: 3, deliveryFee: 5500, zoneId: null, zoneName: '3 km', coverageConfigured: true };
      const { service, pricing } = build(byDistance);
      await expect(service.quoteForOrder('rest-1', 'DELIVERY', 'Riomar', null, { lat: 10.99, lng: -74.81 })).resolves.toBe(byDistance);
      expect(pricing.calculateFee).toHaveBeenCalledWith('rest-1', { lat: 10.99, lng: -74.81 }, undefined);
    });

    it('con pin pero sin coordenadas del local, o sin pin: las zonas de siempre', async () => {
      const notConfigured = build(null);
      await expect(notConfigured.service.quoteForOrder('rest-1', 'DELIVERY', 'Riomar', null, { lat: 10.99, lng: -74.81 })).resolves.toMatchObject({
        zoneId: 'z1',
        deliveryFee: 6000,
      });
      const noPin = build({ isCovered: true });
      await expect(noPin.service.quoteForOrder('rest-1', 'DELIVERY', 'Riomar', null)).resolves.toMatchObject({ zoneId: 'z1' });
      expect(noPin.pricing.calculateFee).not.toHaveBeenCalled();
    });

    it('recoger y mesa no pagan envío aunque haya pin', async () => {
      const { service, pricing } = build({ isCovered: true });
      await expect(service.quoteForOrder('rest-1', 'TAKEAWAY', null, null, { lat: 10.99, lng: -74.81 })).resolves.toBeNull();
      expect(pricing.calculateFee).not.toHaveBeenCalled();
    });
  });
});
