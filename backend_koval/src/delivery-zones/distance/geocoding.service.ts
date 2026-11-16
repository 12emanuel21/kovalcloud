import { Injectable, Logger } from '@nestjs/common';
import { isValidGeoPoint, type GeoPoint } from './distance-calculator.interface';

/**
 * Geocodificación de direcciones escritas (WhatsApp o carta) para cobrar el domicilio por distancia
 * sin exigir el pin GPS. Proveedores gratuitos sobre OpenStreetMap: Photon (Komoot) primero y
 * Nominatim de respaldo. Nunca lanza: si no hay coincidencia devuelve null y quien llama sigue con
 * las zonas o la tarifa estándar.
 */
export interface GeocodeOptions {
  /** Punto del local: prioriza (y limita) los resultados a su ciudad */
  bias?: GeoPoint | null;
  /** Barrio del cliente: afina la búsqueda y es el respaldo si la calle no se ubica con precisión */
  neighborhood?: string | null;
}

export interface IGeocoder {
  geocode(address: string | null | undefined, options?: GeocodeOptions): Promise<GeoPoint | null>;
}

export const GEOCODER = Symbol('GEOCODER');

export const GEOCODER_USER_AGENT = 'KovalCloud/1.0';
export const GEOCODER_TIMEOUT_MS = 3000;
const PHOTON_URL = 'https://photon.komoot.io/api/';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

/** Caja alrededor del local (~40 km): una "Calle 72" de otra ciudad no se confunde con la del cliente */
const BIAS_BOX_DEGREES = 0.35;
/** Política de Nominatim: máximo 1 petición por segundo */
const NOMINATIM_MIN_INTERVAL_MS = 1000;

const CACHE_LIMIT = 500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** "No encontrado" se recuerda menos tiempo (el mapa de OSM mejora) */
const CACHE_MISS_TTL_MS = 60 * 60 * 1000;

/** Qué tan puntual es el resultado: casa (número), calle entera o una zona (barrio) */
type Precision = 'house' | 'street' | 'area';
interface GeocodeHit extends GeoPoint {
  precision: Precision;
}
/** undefined = el proveedor falló (red/timeout); null = respondió sin coincidencias */
type ProviderResult = GeocodeHit | null | undefined;

const WAY_WORDS: Array<[RegExp, string]> = [
  [/\b(?:carrera|cra|crr|cr|kra|kr|k)\b\.?/gi, 'Carrera'],
  [/\b(?:calle|clle|cll|cl)\b\.?/gi, 'Calle'],
  [/\b(?:avenida|avda|av)\b\.?/gi, 'Avenida'],
  [/\b(?:diagonal|diag|dg)\b\.?/gi, 'Diagonal'],
  [/\b(?:transversal|transv|tv|tr)\b\.?/gi, 'Transversal'],
];

/**
 * Dirección colombiana lista para el geocodificador:
 * "cra 38a # 75B-10 apto 401" -> "Carrera 38A 75B-10, Colombia".
 * - Abreviaturas de vía (cra, kr, cl, cll, av, dg, tv) a su nombre completo.
 * - Sin "#", "No." ni "N°" (en una URL sin codificar el "#" corta la consulta).
 * - Sin apto/casa/torre/interior: el mapa no los conoce y estorban la búsqueda.
 * - Con barrio y país si no venían.
 */
export function normalizeColombianAddress(address: string | null | undefined, neighborhood?: string | null): string {
  let text = (address ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  // Detalles internos del inmueble: desde la palabra hasta el final (o la siguiente coma)
  text = text.replace(/\b(?:apto|apartamento|apt|ap|casa|torre|piso|interior|int|bloque|bl|local|oficina|of|conjunto|edificio|edif)\b\.?[^,]*/gi, ' ');
  // "#", "No.", "N°", "Nº", "Nro.", "número" (el ° no es letra: no sirve \b después de él)
  text = text.replace(/#|\bn(?:o\b|[º°])\.?|\bnro\b\.?|\bn[uú]mero\b/gi, ' ');
  for (const [pattern, word] of WAY_WORDS) text = text.replace(pattern, word);
  // 38a -> 38A, 75b-10 -> 75B-10
  text = text.replace(/\b(\d+)([a-z])\b/gi, (_, number: string, letter: string) => `${number}${letter.toUpperCase()}`);
  text = text.replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').replace(/^[,\s]+|[,\s]+$/g, '');

  const place = neighborhood?.replace(/\s+/g, ' ').trim();
  const parts = [text];
  if (place && !text.toLowerCase().includes(place.toLowerCase())) parts.push(place);
  if (!/\bcolombia\b/i.test(text)) parts.push('Colombia');
  return parts.filter(Boolean).join(', ');
}

/** Barrio solo (respaldo cuando la calle no se ubica con precisión) */
const neighborhoodQuery = (neighborhood: string) => `${neighborhood.replace(/\s+/g, ' ').trim()}, Colombia`;

@Injectable()
export class GeocodingService implements IGeocoder {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly cache = new Map<string, { value: GeoPoint | null; expiresAt: number }>();
  private lastNominatimAt = 0;

  /** GEOCODING_ENABLED=false apaga la geocodificación (todo vuelve a zonas / tarifa estándar) */
  private get enabled() {
    return process.env.GEOCODING_ENABLED !== 'false';
  }

  async geocode(address: string | null | undefined, options: GeocodeOptions = {}): Promise<GeoPoint | null> {
    const neighborhood = options.neighborhood?.trim() || null;
    const query = normalizeColombianAddress(address, neighborhood);
    if (!this.enabled || (!query && !neighborhood)) return null;

    const bias = isValidGeoPoint(options.bias) ? options.bias : null;
    const key = `${query}|${neighborhood ?? ''}|${bias ? `${bias.lat.toFixed(2)},${bias.lng.toFixed(2)}` : ''}`.toLowerCase();
    const cached = this.readCache(key);
    if (cached !== undefined) return cached;

    try {
      // 1. La dirección completa (con barrio). Un número de casa ubicado es lo más preciso.
      const street = query ? await this.lookup(query, bias) : null;
      if (street?.precision === 'house') return this.remember(key, street);
      // 2. Si solo se ubicó la calle (puede medir kilómetros), el barrio queda más cerca de la verdad
      const area = neighborhood ? await this.lookup(neighborhoodQuery(neighborhood), bias) : null;
      const best = area ?? street;
      // Si algún proveedor falló por red, no se guarda el "no encontrado": se reintenta luego
      if (best === undefined || (best === null && (street === undefined || area === undefined))) return null;
      return this.remember(key, best);
    } catch (error) {
      this.logger.warn(`Geocodificación falló para "${query}": ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  /** Photon y, si no responde o no encuentra, Nominatim */
  private async lookup(query: string, bias: GeoPoint | null): Promise<ProviderResult> {
    const photon = await this.photon(query, bias);
    if (photon) return photon;
    const nominatim = await this.nominatim(query, bias);
    if (nominatim) return nominatim;
    // Ambos respondieron sin resultados -> null (se puede cachear); alguno falló -> undefined
    return photon === null && nominatim === null ? null : undefined;
  }

  private async photon(query: string, bias: GeoPoint | null): Promise<ProviderResult> {
    const params = new URLSearchParams({ q: query, limit: '1', lang: 'es' });
    if (bias) {
      params.set('lat', String(bias.lat));
      params.set('lon', String(bias.lng));
      params.set('bbox', boxAround(bias).join(','));
    }
    const data = await this.getJson<{ features?: Array<{ geometry?: { coordinates?: [number, number] }; properties?: Record<string, unknown> }> }>(
      `${PHOTON_URL}?${params}`,
    );
    if (data === undefined) return undefined;
    const feature = data?.features?.[0];
    const [lng, lat] = feature?.geometry?.coordinates ?? [];
    const point = { lat: Number(lat), lng: Number(lng) };
    if (!feature || !isValidGeoPoint(point)) return null;
    const props = feature.properties ?? {};
    const precision: Precision = props.housenumber || props.type === 'house' ? 'house' : props.type === 'street' || props.osm_key === 'highway' ? 'street' : 'area';
    return { ...point, precision };
  }

  private async nominatim(query: string, bias: GeoPoint | null): Promise<ProviderResult> {
    // Respeta el límite de 1 req/s del servicio público: si no toca, se omite (no se cachea)
    const now = Date.now();
    if (now - this.lastNominatimAt < NOMINATIM_MIN_INTERVAL_MS) return undefined;
    this.lastNominatimAt = now;

    const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1', countrycodes: 'co' });
    if (bias) {
      const [minLng, minLat, maxLng, maxLat] = boxAround(bias);
      params.set('viewbox', [minLng, maxLat, maxLng, minLat].join(','));
      params.set('bounded', '1');
    }
    const data = await this.getJson<Array<{ lat?: string; lon?: string; addresstype?: string; type?: string; category?: string }>>(
      `${NOMINATIM_URL}?${params}`,
    );
    if (data === undefined) return undefined;
    const hit = Array.isArray(data) ? data[0] : undefined;
    const point = { lat: Number(hit?.lat), lng: Number(hit?.lon) };
    if (!hit || !isValidGeoPoint(point)) return null;
    const kind = hit.addresstype ?? hit.type;
    const precision: Precision =
      kind === 'house' || kind === 'building' ? 'house' : kind === 'road' || hit.category === 'highway' ? 'street' : 'area';
    return { ...point, precision };
  }

  /** GET con User-Agent propio y 3 s de tope. undefined si la red, el timeout o el HTTP fallan. */
  private async getJson<T>(url: string): Promise<T | undefined> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': GEOCODER_USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(GEOCODER_TIMEOUT_MS),
      });
      if (!res.ok) return undefined;
      return (await res.json()) as T;
    } catch {
      return undefined;
    }
  }

  // --- Caché LRU en memoria (500 entradas, 24 h) ---

  private readCache(key: string): GeoPoint | null | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    // Uso reciente: pasa al final (el primero del Map es el menos usado)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  private remember(key: string, hit: GeocodeHit | null): GeoPoint | null {
    const value = hit ? { lat: hit.lat, lng: hit.lng } : null;
    this.cache.delete(key);
    this.cache.set(key, { value, expiresAt: Date.now() + (value ? CACHE_TTL_MS : CACHE_MISS_TTL_MS) });
    while (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    return value;
  }
}

/** [minLng, minLat, maxLng, maxLat] alrededor del punto */
function boxAround(point: GeoPoint): [number, number, number, number] {
  const round = (value: number) => Number(value.toFixed(4));
  return [
    round(point.lng - BIAS_BOX_DEGREES),
    round(point.lat - BIAS_BOX_DEGREES),
    round(point.lng + BIAS_BOX_DEGREES),
    round(point.lat + BIAS_BOX_DEGREES),
  ];
}
