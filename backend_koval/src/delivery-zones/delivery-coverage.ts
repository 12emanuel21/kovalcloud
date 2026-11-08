/**
 * Cobertura de domicilios: a qué zona (y tarifa) pertenece un barrio o dirección.
 * La coincidencia es por palabras completas, sin tildes ni mayúsculas: "Alto Prado" encuentra
 * "Cra 52 # 76-10, alto prado" pero no "Altos del Prado Norte" por una sola palabra suelta.
 */

export interface CoverageZone {
  id: string;
  name: string;
  keywords: string[];
  fee: number;
}

/** Sin zonas configuradas el local no restringe: todo domicilio entra sin flete calculado */
export type DeliveryQuote =
  | { isCovered: true; zoneId: string; zoneName: string; deliveryFee: number; coverageConfigured: true }
  | { isCovered: true; zoneId: null; zoneName: null; deliveryFee: 0; coverageConfigured: false }
  | { isCovered: false; deliveryFee: 0; fallback: 'PICKUP'; coverageConfigured: true };

export const NO_COVERAGE_CONFIGURED: DeliveryQuote = {
  isCovered: true,
  zoneId: null,
  zoneName: null,
  deliveryFee: 0,
  coverageConfigured: false,
};
export const NOT_COVERED: DeliveryQuote = { isCovered: false, deliveryFee: 0, fallback: 'PICKUP', coverageConfigured: true };

/** "Villa Santos, Cra. 52" -> "villa santos cra 52" */
export function normalizePlace(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

/** Términos que identifican la zona: sus palabras clave y las partes de su nombre ("Norte / Riomar") */
function zoneTerms(zone: CoverageZone): string[] {
  const nameParts = zone.name.split(/[/,;|]+/);
  return [...zone.keywords, ...nameParts].map(normalizePlace).filter((term) => term.length >= 3);
}

/**
 * Zona que cubre el texto (barrio o dirección). Si varias coinciden gana el término más largo
 * (el más específico: "villa santos" antes que "santos").
 */
export function matchDeliveryZone<T extends CoverageZone>(zones: T[], ...places: Array<string | null | undefined>): T | null {
  const text = ` ${places.map(normalizePlace).filter(Boolean).join(' ')} `;
  if (!text.trim()) return null;
  let best: { zone: T; length: number } | null = null;
  for (const zone of zones) {
    for (const term of zoneTerms(zone)) {
      if (text.includes(` ${term} `) && (!best || term.length > best.length)) best = { zone, length: term.length };
    }
  }
  return best?.zone ?? null;
}

export function quoteFor<T extends CoverageZone>(zones: T[], ...places: Array<string | null | undefined>): DeliveryQuote {
  if (zones.length === 0) return NO_COVERAGE_CONFIGURED;
  const zone = matchDeliveryZone(zones, ...places);
  if (!zone) return NOT_COVERED;
  return { isCovered: true, zoneId: zone.id, zoneName: zone.name, deliveryFee: zone.fee, coverageConfigured: true };
}
