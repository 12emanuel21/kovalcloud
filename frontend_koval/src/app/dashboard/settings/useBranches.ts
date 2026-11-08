'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

const API_URL = typeof window !== 'undefined' ? '/api' : 'http://koval_backend:4000';

/** Sede de la marca (GET /restaurants/:id/branches) */
export interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  isMain: boolean;
  isActive: boolean;
}

/** Mensaje legible de un error de la API (ValidationPipe devuelve message como arreglo) */
export async function branchApiError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const message = Array.isArray(data.message) ? data.message.join('. ') : data.message;
  return message || fallback;
}

/**
 * Sedes del restaurante para Ajustes (pestaña Sedes y selectores de zonas, repartidores y cocinas).
 * Si falla la carga se sigue como un solo local (sin selector de sede).
 */
export function useBranches() {
  const { token, restaurantId } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const base = restaurantId ? `${API_URL}/restaurants/${encodeURIComponent(restaurantId)}/branches` : null;
  const headers = useCallback(
    (): Record<string, string> => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token],
  );

  useEffect(() => {
    if (!base || !token) return;
    let cancelled = false;
    fetch(base, { cache: 'no-store', headers: headers() })
      .then(async (res) => {
        if (!res.ok) throw new Error(await branchApiError(res, 'No se pudieron cargar las sedes'));
        return res.json() as Promise<Branch[]>;
      })
      .then((data) => {
        if (!cancelled) setBranches(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar las sedes');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [base, token, headers]);

  return { branches, setBranches, loading, error, base, headers };
}

/** Nombre de la sede para tablas ("—" si no tiene) */
export const branchNameOf = (branches: Branch[], branchId: string | null | undefined, fallback = '—') =>
  branches.find((branch) => branch.id === branchId)?.name ?? fallback;
