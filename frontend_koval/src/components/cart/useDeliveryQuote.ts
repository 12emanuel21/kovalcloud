'use client';

import { useEffect, useState } from 'react';

const API_URL = '/api';
const QUOTE_DEBOUNCE_MS = 500;

/** Respuesta de GET /restaurants/:id/delivery-coverage/quote (misma forma que calculateDeliveryFee) */
export type DeliveryQuote =
  | {
      isCovered: true;
      zoneId: string | null;
      zoneName: string | null;
      deliveryFee: number;
      coverageConfigured: boolean;
      /** Por distancia (pin GPS): km viales estimados */
      distanceKm?: number;
    }
  | { isCovered: false; deliveryFee: 0; fallback: 'TAKEAWAY'; coverageConfigured: true; distanceKm?: number; maxRadius?: number };

/** Pin GPS del cliente ("Usar mi ubicación actual") */
export interface CustomerCoords {
  lat: number;
  lng: number;
}

export interface DeliveryCoverage {
  coverageConfigured: boolean;
  zones: Array<{ name: string; fee: number }>;
  /** Tarifa estándar del local para barrios fuera de las zonas (null = no tiene) */
  defaultDeliveryFee?: number | null;
}

/** Mismo nombre que usa el backend para la tarifa estándar */
const DEFAULT_FEE_ZONE_NAME = 'Tarifa general';

/**
 * Cobertura y flete del domicilio en la carta: carga las zonas del local al abrir el carrito y
 * cotiza (con pausa mientras el cliente escribe) el barrio o la dirección. El backend recalcula
 * igual al crear el pedido; esto solo muestra el desglose antes de confirmar.
 */
export function useDeliveryQuote(
  restaurantId: string,
  enabled: boolean,
  neighborhood: string,
  address: string,
  coords: CustomerCoords | null = null,
) {
  const [coverage, setCoverage] = useState<DeliveryCoverage | null>(null);
  const [quoted, setQuoted] = useState<{ key: string; quote: DeliveryQuote } | null>(null);
  const place = neighborhood.trim();
  const key = `${place}|${address.trim()}|${coords ? `${coords.lat},${coords.lng}` : ''}`;
  const hasZones = Boolean(coverage?.zones.length);
  const defaultFee = coverage?.defaultDeliveryFee && coverage.defaultDeliveryFee > 0 ? coverage.defaultDeliveryFee : null;
  // Con pin GPS se cotiza por distancia (si el local está ubicado; si no, el backend usa las zonas).
  // Con zonas se cotiza el barrio en el backend; solo con tarifa estándar no hace falta preguntar
  const shouldQuote = enabled && (Boolean(coords) || (hasZones && Boolean(place || address.trim())));

  useEffect(() => {
    if (!enabled || !restaurantId) return;
    let cancelled = false;
    fetch(`${API_URL}/restaurants/${encodeURIComponent(restaurantId)}/delivery-coverage`, { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<DeliveryCoverage>) : null))
      .then((data) => {
        if (!cancelled && data) setCoverage(data);
      })
      .catch(() => {
        // Sin cobertura cargada no se muestra desglose; el backend calcula el flete al confirmar
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, restaurantId]);

  useEffect(() => {
    if (!shouldQuote) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        neighborhood: place,
        address: address.trim(),
        ...(coords ? { lat: String(coords.lat), lng: String(coords.lng) } : {}),
      });
      fetch(`${API_URL}/restaurants/${encodeURIComponent(restaurantId)}/delivery-coverage/quote?${params}`, { cache: 'no-store' })
        .then((res) => (res.ok ? (res.json() as Promise<DeliveryQuote>) : null))
        .then((quote) => {
          if (!cancelled && quote) setQuoted({ key, quote });
        })
        .catch(() => {});
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [shouldQuote, restaurantId, place, address, key, coords]);

  const flatQuote: DeliveryQuote | null =
    enabled && !coords && !hasZones && defaultFee !== null
      ? { isCovered: true, zoneId: null, zoneName: DEFAULT_FEE_ZONE_NAME, deliveryFee: defaultFee, coverageConfigured: true }
      : null;
  const quote = flatQuote ?? (shouldQuote && quoted?.key === key ? quoted.quote : null);
  return {
    coverage,
    /** El local tiene zonas: el barrio define la tarifa (y es obligatorio) */
    hasZones,
    quote,
    /** Cotizando el texto actual (todavía no hay respuesta para lo que escribió) */
    quoting: shouldQuote && quoted?.key !== key,
    deliveryFee: quote?.isCovered ? quote.deliveryFee : 0,
    /** La tarifa salió del pin GPS (el barrio deja de ser obligatorio) */
    byDistance: quote?.distanceKm !== undefined,
  };
}
