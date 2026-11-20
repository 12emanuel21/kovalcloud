'use client';

import { useEffect, useState } from 'react';

const API_URL = '/api';

/**
 * Tarifa fija única del domicilio (GET /restaurants/:id/delivery-coverage). Con ella el carrito la
 * suma al total; sin ella (null) el local confirma el valor por WhatsApp al recibir el pedido.
 * Mientras carga, o si falla, se trata como "por confirmar": el backend decide el valor real.
 */
export function useFlatDeliveryFee(restaurantId: string, enabled: boolean) {
  const [flatDeliveryFee, setFlatDeliveryFee] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || !restaurantId) return;
    let cancelled = false;
    fetch(`${API_URL}/restaurants/${encodeURIComponent(restaurantId)}/delivery-coverage`, { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<{ flatDeliveryFee?: number | null }>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        const fee = data.flatDeliveryFee;
        setFlatDeliveryFee(typeof fee === 'number' && fee >= 0 ? fee : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, restaurantId]);

  return { flatDeliveryFee };
}
