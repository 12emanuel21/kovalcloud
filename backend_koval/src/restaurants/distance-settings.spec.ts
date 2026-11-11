import { distancePricingData } from './restaurants.service';

describe('Ajustes de domicilio por distancia', () => {
  it('redondea tarifas a pesos y km a 1 decimal, y solo incluye lo enviado', () => {
    expect(distancePricingData({ baseDeliveryFee: 4000.6, baseDeliveryKm: 2.04, extraKmFee: 1499.5, maxDeliveryRadiusKm: 7.96 })).toEqual({
      baseDeliveryFee: 4001,
      baseDeliveryKm: 2,
      extraKmFee: 1500,
      maxDeliveryRadiusKm: 8,
    });
    expect(distancePricingData({})).toEqual({});
    expect(distancePricingData({ extraKmFee: 2000 })).toEqual({ extraKmFee: 2000 });
  });
});
