import { matchDeliveryZone, normalizePlace, quoteFor } from './delivery-coverage';

const zones = [
  { id: 'z-norte', name: 'Norte / Riomar', keywords: ['riomar', 'alto prado', 'villa santos'], fee: 6000 },
  { id: 'z-centro', name: 'Centro', keywords: ['el prado', 'boston', 'santos'], fee: 4000 },
];

describe('calculateDeliveryFee · coincidencia de zonas', () => {
  it('encuentra la zona por palabra clave, sin tildes ni mayúsculas', () => {
    expect(quoteFor(zones, 'ALTO PRADO')).toEqual({
      isCovered: true,
      zoneId: 'z-norte',
      zoneName: 'Norte / Riomar',
      deliveryFee: 6000,
      coverageConfigured: true,
    });
    expect(matchDeliveryZone(zones, 'Bóston')?.id).toBe('z-centro');
  });

  it('también por las partes del nombre de la zona y dentro de la dirección', () => {
    expect(matchDeliveryZone(zones, null, 'Cra 52 # 98-10, barrio Riomar')?.id).toBe('z-norte');
    expect(matchDeliveryZone(zones, 'centro')?.id).toBe('z-centro');
  });

  it('gana el término más específico: "villa santos" antes que "santos"', () => {
    expect(matchDeliveryZone(zones, 'Villa Santos')?.id).toBe('z-norte');
    expect(matchDeliveryZone(zones, 'Santos')?.id).toBe('z-centro');
  });

  it('palabras completas: "prado" suelto no es "alto prado" ni "el prado"', () => {
    expect(matchDeliveryZone(zones, 'Prado')).toBeNull();
    expect(matchDeliveryZone(zones, 'Altos del Riomarino')).toBeNull();
  });

  it('sin coincidencia: no cubierto, flete 0 y se sugiere recoger', () => {
    expect(quoteFor(zones, 'Soledad')).toEqual({ isCovered: false, deliveryFee: 0, fallback: 'PICKUP', coverageConfigured: true });
    expect(quoteFor(zones, '', null)).toMatchObject({ isCovered: false, fallback: 'PICKUP' });
  });

  it('local sin zonas configuradas: no restringe (cubierto, flete 0)', () => {
    expect(quoteFor([], 'Soledad')).toEqual({ isCovered: true, zoneId: null, zoneName: null, deliveryFee: 0, coverageConfigured: false });
  });

  it('normaliza puntuación y espacios', () => {
    expect(normalizePlace('  Villa-Santos,  Cra. 52 ')).toBe('villa santos cra 52');
  });
});
