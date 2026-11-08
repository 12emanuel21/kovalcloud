'use client';

import { useEffect, useState } from 'react';

const API_URL = '/api';

/** Sede activa para recoger (GET /restaurants/:id/pickup-branches) */
export interface PickupBranch {
  id: string;
  name: string;
  address: string;
  isMain: boolean;
}

/**
 * Sedes de la marca para "Recoger en el local". Sin sedes (o si falla la carga) la carta funciona
 * como un solo local y el backend asigna la sede principal.
 */
export function usePickupBranches(restaurantId: string, enabled: boolean) {
  const [branches, setBranches] = useState<PickupBranch[]>([]);

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
  }, [enabled, restaurantId]);

  return branches;
}
