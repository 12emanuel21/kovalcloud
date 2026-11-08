'use client';

import { useEffect, useState } from 'react';

const API_URL = '/api';
const QUOTE_DEBOUNCE_MS = 500;

/** Respuesta de GET /restaurants/:id/delivery-coverage/quote (misma forma que calculateDeliveryFee) */
export type DeliveryQuote =
  | { isCovered: true; zoneId: string | null; zoneName: string | null; deliveryFee: number; coverageConfigured: boolean }
  | { isCovered: false; deliveryFee: 0; fallback: 'PICKUP'; coverageConfigured: true };

export interface DeliveryCoverage {
  coverageConfigured: boolean;
  zones: Array<{ name: string; fee: number }>;
}

/**
 * Cobertura y flete del domicilio en la carta: carga las zonas del local al abrir el carrito y
 * cotiza (con pausa mientras el cliente escribe) el barrio o la dirección. El backend recalcula
 * igual al crear el pedido; esto solo muestra el desglose antes de confirmar.
 */
export function useDeliveryQuote(restaurantId: string, enabled: boolean, neighborhood: string, address: string) {
  const [coverage, setCoverage] = useState<DeliveryCoverage | null>(null);
  const [quoted, setQuoted] = useState<{ key: string; quote: DeliveryQuote } | null>(null);
  const place = neighborhood.trim();
  const key = `${place}|${address.trim()}`;
  const shouldQuote = enabled && Boolean(coverage?.coverageConfigured) && Boolean(place || address.trim());

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
      const params = new URLSearchParams({ neighborhood: place, address: address.trim() });
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
  }, [shouldQuote, restaurantId, place, address, key]);

  const quote = shouldQuote && quoted?.key === key ? quoted.quote : null;
  return {
    coverage,
    quote,
    /** Cotizando el texto actual (todavía no hay respuesta para lo que escribió) */
    quoting: shouldQuote && quoted?.key !== key,
    deliveryFee: quote?.isCovered ? quote.deliveryFee : 0,
  };
}
