import { GEOCODER_USER_AGENT, GeocodingService, normalizeColombianAddress } from './geocoding.service';

const BARRANQUILLA = { lat: 10.9878, lng: -74.7889 };

/** Respuesta de Photon con un resultado */
const photonHit = (lat: number, lng: number, properties: Record<string, unknown> = { type: 'house', housenumber: '75B-10' }) => ({
  ok: true,
  json: () => Promise.resolve({ features: [{ geometry: { coordinates: [lng, lat] }, properties }] }),
});
const photonEmpty = () => ({ ok: true, json: () => Promise.resolve({ features: [] }) });
const nominatimHit = (lat: number, lng: number, addresstype = 'house') => ({
  ok: true,
  json: () => Promise.resolve([{ lat: String(lat), lon: String(lng), addresstype }]),
});
const nominatimEmpty = () => ({ ok: true, json: () => Promise.resolve([]) });

describe('Normalización de direcciones colombianas', () => {
  it('Cra 38a # 75B-10 -> Carrera 38A 75B-10, con país', () => {
    expect(normalizeColombianAddress('Cra 38a # 75B-10')).toBe('Carrera 38A 75B-10, Colombia');
  });

  it('abreviaturas de vía, sin "#" ni "No.", y sin detalles internos del inmueble', () => {
    expect(normalizeColombianAddress('kr 45 # 26-85 apto 401')).toBe('Carrera 45 26-85, Colombia');
    expect(normalizeColombianAddress('cll 72 No. 43-15, Riomar')).toBe('Calle 72 43-15, Riomar, Colombia');
    expect(normalizeColombianAddress('Cl 30 n° 12-45 torre 2 int 5')).toBe('Calle 30 12-45, Colombia');
    expect(normalizeColombianAddress('Av. Circunvalar # 5-10')).toBe('Avenida Circunvalar 5-10, Colombia');
    expect(normalizeColombianAddress('dg 12a # 4-20')).toBe('Diagonal 12A 4-20, Colombia');
    expect(normalizeColombianAddress('tv 5 # 8-1')).toBe('Transversal 5 8-1, Colombia');
  });

  it('agrega el barrio si no venía y no repite el país', () => {
    expect(normalizeColombianAddress('Cra 52 # 76-10', 'Alto Prado')).toBe('Carrera 52 76-10, Alto Prado, Colombia');
    expect(normalizeColombianAddress('Calle 84 # 51B-20, Alto Prado', 'alto prado')).toBe('Calle 84 51B-20, Alto Prado, Colombia');
    expect(normalizeColombianAddress('Calle 1, Barranquilla, Colombia')).toBe('Calle 1, Barranquilla, Colombia');
    expect(normalizeColombianAddress('   ')).toBe('');
  });
});

describe('GeocodingService', () => {
  let fetchMock: jest.SpyInstance;
  const env = process.env.GEOCODING_ENABLED;
  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
    delete process.env.GEOCODING_ENABLED;
  });
  afterEach(() => {
    fetchMock.mockRestore();
    jest.useRealTimers();
    process.env.GEOCODING_ENABLED = env;
  });
  const urlOf = (call: number) => new URL(String(fetchMock.mock.calls[call][0]));

  it('Photon con sesgo y caja alrededor del local, User-Agent propio y timeout de 3 s', async () => {
    fetchMock.mockResolvedValueOnce(photonHit(11.0012, -74.8121) as any);
    const service = new GeocodingService();

    await expect(service.geocode('Cra 38a # 75B-10', { bias: BARRANQUILLA })).resolves.toEqual({ lat: 11.0012, lng: -74.8121 });

    const url = urlOf(0);
    expect(url.origin + url.pathname).toBe('https://photon.komoot.io/api/');
    // El "#" no viaja (cortaría la consulta) y la vía va completa
    expect(url.searchParams.get('q')).toBe('Carrera 38A 75B-10, Colombia');
    expect(url.searchParams.get('limit')).toBe('1');
    expect(url.searchParams.get('lat')).toBe('10.9878');
    expect(url.searchParams.get('lon')).toBe('-74.7889');
    expect(url.searchParams.get('bbox')).toBe('-75.1389,10.6378,-74.4389,11.3378');
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers['User-Agent']).toBe(GEOCODER_USER_AGENT);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('caché en memoria: la misma dirección responde sin volver a la red', async () => {
    fetchMock.mockResolvedValueOnce(photonHit(11.0012, -74.8121) as any);
    const service = new GeocodingService();
    const first = await service.geocode('Cra 38a # 75B-10', { bias: BARRANQUILLA });
    // Otra forma de escribir la misma dirección normaliza igual
    const second = await service.geocode('cra 38A #75b-10', { bias: BARRANQUILLA });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('la caché vence a las 24 h y guarda como máximo 500 direcciones (se va la menos usada)', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-16T12:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
    fetchMock.mockImplementation(() => Promise.resolve(photonHit(11, -74.8) as any));
    const service = new GeocodingService();
    const cache = (service as any).cache as Map<string, unknown>;

    await service.geocode('Calle 1 # 1-1');
    for (let i = 2; i <= 501; i++) await service.geocode(`Calle ${i} # 1-1`);
    expect(cache.size).toBe(500);
    // La primera (la menos usada) salió; la última sigue
    fetchMock.mockClear();
    await service.geocode('Calle 501 # 1-1');
    expect(fetchMock).not.toHaveBeenCalled();
    await service.geocode('Calle 1 # 1-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    jest.setSystemTime(new Date('2026-11-17T12:00:01Z'));
    await service.geocode('Calle 501 # 1-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('Photon sin resultados o caído: Nominatim (con caja limitada a la ciudad y solo Colombia)', async () => {
    fetchMock.mockResolvedValueOnce(photonEmpty() as any).mockResolvedValueOnce(nominatimHit(10.97, -74.8) as any);
    const service = new GeocodingService();
    await expect(service.geocode('Calle 30 # 12-45', { bias: BARRANQUILLA })).resolves.toEqual({ lat: 10.97, lng: -74.8 });
    const url = urlOf(1);
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect(url.searchParams.get('countrycodes')).toBe('co');
    expect(url.searchParams.get('bounded')).toBe('1');
    expect(url.searchParams.get('viewbox')).toBe('-75.1389,11.3378,-74.4389,10.6378');
    expect(fetchMock.mock.calls[1][1].headers['User-Agent']).toBe('KovalCloud/1.0');

    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    fetchMock.mockResolvedValueOnce(nominatimHit(10.95, -74.79) as any);
    const other = new GeocodingService();
    await expect(other.geocode('Calle 45 # 20-10')).resolves.toEqual({ lat: 10.95, lng: -74.79 });
  });

  it('si la calle solo se ubica como calle entera, usa el barrio (más cercano a la casa)', async () => {
    fetchMock
      .mockResolvedValueOnce(photonHit(10.9, -74.75, { type: 'street', osm_key: 'highway' }) as any)
      .mockResolvedValueOnce(photonHit(11.01, -74.83, { type: 'district' }) as any);
    const service = new GeocodingService();
    await expect(service.geocode('Carrera 46 # 80-20', { bias: BARRANQUILLA, neighborhood: 'Riomar' })).resolves.toEqual({
      lat: 11.01,
      lng: -74.83,
    });
    expect(urlOf(1).searchParams.get('q')).toBe('Riomar, Colombia');
  });

  it('ambos proveedores fallan o no encuentran: null sin lanzar; un fallo de red no se guarda en caché', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));
    const service = new GeocodingService();
    await expect(service.geocode('Calle 99 # 1-1', { bias: BARRANQUILLA })).resolves.toBeNull();
    expect((service as any).cache.size).toBe(0);

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(photonEmpty() as any).mockResolvedValueOnce(nominatimEmpty() as any);
    const other = new GeocodingService();
    await expect(other.geocode('Calle inventada 123')).resolves.toBeNull();
    // "No existe" sí se recuerda (sin volver a la red)
    await expect(other.geocode('Calle inventada 123')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) } as any);
    await expect(new GeocodingService().geocode('Calle 5 # 5-5')).resolves.toBeNull();
  });

  it('sin dirección ni barrio, o con GEOCODING_ENABLED=false, no consulta la red', async () => {
    const service = new GeocodingService();
    await expect(service.geocode('   ')).resolves.toBeNull();
    await expect(service.geocode(null)).resolves.toBeNull();
    process.env.GEOCODING_ENABLED = 'false';
    await expect(service.geocode('Calle 30 # 12-45')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
