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
  /** Sede que atiende la zona (null/ausente = la principal) */
  branchId?: string | null;
}

/**
 * Cotización del domicilio:
 * - zona encontrada: su tarifa;
 * - sin zona pero con tarifa estándar del local: esa tarifa ("Tarifa general");
 * - sin zona ni tarifa estándar, con zonas creadas: fuera de cobertura (se ofrece recoger, TAKEAWAY);
 * - local sin zonas ni tarifa estándar: no restringe (cubierto, sin flete, coverageConfigured: false).
 */
export type DeliveryQuote =
  | {
      isCovered: true;
      zoneId: string | null;
      zoneName: string | null;
      deliveryFee: number;
      coverageConfigured: boolean;
      /** Sede de la zona encontrada (solo si la zona tiene sede asignada) */
      branchId?: string | null;
    }
  | { isCovered: false; deliveryFee: 0; fallback: 'TAKEAWAY'; coverageConfigured: true };

export const DEFAULT_FEE_ZONE_NAME = 'Tarifa general';

export const NO_COVERAGE_CONFIGURED: DeliveryQuote = {
  isCovered: true,
  zoneId: null,
  zoneName: null,
  deliveryFee: 0,
  coverageConfigured: false,
};
export const NOT_COVERED: DeliveryQuote = { isCovered: false, deliveryFee: 0, fallback: 'TAKEAWAY', coverageConfigured: true };

/** Tarifa estándar utilizable (null, 0 o inválida = no hay) */
export const usableDefaultFee = (fee: number | null | undefined): number | null =>
  typeof fee === 'number' && Number.isFinite(fee) && fee > 0 ? fee : null;

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

export function quoteFor<T extends CoverageZone>(
  zones: T[],
  defaultDeliveryFee: number | null | undefined,
  ...places: Array<string | null | undefined>
): DeliveryQuote {
  // 1. Zona específica del barrio o la dirección
  const zone = matchDeliveryZone(zones, ...places);
  if (zone) {
    return {
      isCovered: true,
      zoneId: zone.id,
      zoneName: zone.name,
      deliveryFee: zone.fee,
      coverageConfigured: true,
      ...(zone.branchId ? { branchId: zone.branchId } : {}),
    };
  }
  // 2. Tarifa estándar del local: cubre cualquier barrio que no esté en las zonas
  const defaultFee = usableDefaultFee(defaultDeliveryFee);
  if (defaultFee !== null) {
    return { isCovered: true, zoneId: null, zoneName: DEFAULT_FEE_ZONE_NAME, deliveryFee: defaultFee, coverageConfigured: true };
  }
  // 3. Con zonas pero sin tarifa estándar: fuera de cobertura; sin nada configurado: sin restricción
  return zones.length > 0 ? NOT_COVERED : NO_COVERAGE_CONFIGURED;
}
