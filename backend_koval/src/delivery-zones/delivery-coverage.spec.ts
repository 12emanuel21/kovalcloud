import { matchDeliveryZone, normalizePlace, quoteFor } from './delivery-coverage';

const zones = [
  { id: 'z-norte', name: 'Norte / Riomar', keywords: ['riomar', 'alto prado', 'villa santos'], fee: 6000 },
  { id: 'z-centro', name: 'Centro', keywords: ['el prado', 'boston', 'santos'], fee: 4000 },
];

describe('calculateDeliveryFee · coincidencia de zonas', () => {
  it('encuentra la zona por palabra clave, sin tildes ni mayúsculas', () => {
    expect(quoteFor(zones, null, 'ALTO PRADO')).toEqual({
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

  it('sin coincidencia ni tarifa estándar: no cubierto, flete 0 y se sugiere recoger', () => {
    expect(quoteFor(zones, null, 'Soledad')).toEqual({ isCovered: false, deliveryFee: 0, fallback: 'TAKEAWAY', coverageConfigured: true });
    expect(quoteFor(zones, 0, '', null)).toMatchObject({ isCovered: false, fallback: 'TAKEAWAY' });
  });

  it('local sin zonas ni tarifa estándar: no restringe (cubierto, flete 0)', () => {
    expect(quoteFor([], null, 'Soledad')).toEqual({ isCovered: true, zoneId: null, zoneName: null, deliveryFee: 0, coverageConfigured: false });
  });

  it('normaliza puntuación y espacios', () => {
    expect(normalizePlace('  Villa-Santos,  Cra. 52 ')).toBe('villa santos cra 52');
  });

  it('tarifa estándar: cubre los barrios fuera de las zonas, pero la zona específica manda', () => {
    expect(quoteFor(zones, 15000, 'Soledad')).toEqual({
      isCovered: true,
      zoneId: null,
      zoneName: 'Tarifa general',
      deliveryFee: 15000,
      coverageConfigured: true,
    });
    expect(quoteFor(zones, 15000, 'Riomar')).toMatchObject({ zoneId: 'z-norte', deliveryFee: 6000 });
  });

  it('solo tarifa estándar (sin zonas): toda la ciudad paga esa tarifa, aun sin barrio', () => {
    expect(quoteFor([], 15000, 'Cualquier barrio')).toMatchObject({ isCovered: true, zoneName: 'Tarifa general', deliveryFee: 15000 });
    expect(quoteFor([], 15000)).toMatchObject({ isCovered: true, deliveryFee: 15000 });
  });

  it('tarifa estándar en 0 o inválida cuenta como no configurada', () => {
    expect(quoteFor(zones, 0, 'Soledad')).toMatchObject({ isCovered: false });
    expect(quoteFor([], 0, 'Soledad')).toMatchObject({ isCovered: true, deliveryFee: 0, coverageConfigured: false });
    expect(quoteFor([], Number.NaN, 'Soledad')).toMatchObject({ coverageConfigured: false });
  });
});
