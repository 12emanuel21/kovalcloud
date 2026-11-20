'use client';

import { useCallback, useEffect, useState } from 'react';

const API_URL = '/api';

/** Sede activa de la marca (GET /restaurants/:id/pickup-branches: la principal primero) */
export interface PickupBranch {
  id: string;
  name: string;
  address: string;
  isMain: boolean;
}

/**
 * Sedes de la marca para que el cliente elija a cuál envía su pedido (domicilio o recoger). Sin sedes,
 * con una sola o si falla la carga, la carta funciona como un solo local y el backend asigna la sede.
 * reload(): vuelve a pedirlas (p. ej. si la sede elegida se desactivó mientras el cliente pedía).
 */
export function usePickupBranches(restaurantId: string, enabled: boolean) {
  const [branches, setBranches] = useState<PickupBranch[]>([]);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!enabled || !restaurantId) return;
    let cancelled = false;
    fetch(`${API_URL}/restaurants/${encodeURIComponent(restaurantId)}/pickup-branches`, { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<PickupBranch[]>) : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setBranches(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, restaurantId, version]);

  return { branches, reload };
}
