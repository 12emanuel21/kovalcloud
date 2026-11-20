'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSudoMode } from '@/context/SudoContext';
import type { BusinessHours } from '@/lib/business-hours';

export const SETTINGS_API_URL = typeof window !== 'undefined' ? '/api' : 'http://koval_backend:4000';

/** GET /restaurants/:id: los campos que editan las tarjetas de Ajustes */
export interface RestaurantSettings {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  phone?: string | null;
  /** Línea real conectada al bot (SIM de WhatsApp Web o número de Meta) */
  whatsappBotNumber?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  currency?: string | null;
  theme?: string | null;
  menuColorMode?: string | null;
  layout?: string | null;
  customColor?: string | null;
  fontFamily?: string | null;
  address?: string | null;
  paymentDetails?: string | null;
  businessHours?: BusinessHours | null;
  isTemporarilyClosed?: boolean;
  closedMessage?: string | null;
  /** Domicilio manual: montos de los botones rápidos del tablero y tarifa fija única (opcional) */
  deliveryFeePresets?: number[] | null;
  flatDeliveryFee?: number | null;
  owner?: { id: string; email: string; role: string } | null;
  plan?: { id: string; name: string; price: number } | null;
}

/** Mensaje legible de un error de la API (ValidationPipe devuelve message como arreglo) */
export async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const message = Array.isArray(data.message) ? data.message.join('. ') : data.message;
  return message || fallback;
}

/**
 * Datos del restaurante para toda la página de Ajustes: se leen una vez y cada tarjeta guarda solo
 * sus campos (PATCH parcial) y actualiza aquí lo guardado con `applySaved`. Así una sección vuelve
 * a abrirse con los valores vigentes sin otra lectura.
 */
export function useRestaurantSettings() {
  const { restaurantId, token } = useAuth();
  const [restaurant, setRestaurant] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId || !token) return;
    let cancelled = false;
    // Sin setLoading(true): el cargador es solo de la primera lectura. Al releer (token nuevo tras
    // cambiar la contraseña) las tarjetas siguen montadas y conservan lo que se está editando.
    fetch(`${SETTINGS_API_URL}/restaurants/${encodeURIComponent(restaurantId)}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo cargar la configuración del restaurante'));
        return res.json() as Promise<RestaurantSettings>;
      })
      .then((data) => {
        if (cancelled) return;
        setRestaurant(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar la configuración del restaurante');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, token]);

  const applySaved = useCallback(
    (saved: Partial<RestaurantSettings>) => setRestaurant((prev) => (prev ? { ...prev, ...saved } : prev)),
    [],
  );

  return { restaurant, loading, error, applySaved };
}

/** PATCH /restaurants/:id/config con solo los campos de la tarjeta (los demás no se tocan) */
export function useConfigPatch() {
  const { restaurantId, token } = useAuth();
  // Sudo Mode: el backend pide el código 2FA solo si cambian las llaves de Wompi
  const { sudoFetch } = useSudoMode();
  return async (body: Record<string, unknown>, fallback: string) => {
    const res = await sudoFetch(`${SETTINGS_API_URL}/restaurants/${restaurantId}/config`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await apiErrorMessage(res, fallback));
    return res.json() as Promise<Partial<RestaurantSettings>>;
  };
}

/**
 * PATCH /restaurants/:id con solo los campos de la tarjeta (identidad, enlace y apariencia).
 * Devuelve el restaurante completo ya guardado.
 */
export function useRestaurantPatch() {
  const { restaurantId, token } = useAuth();
  // Sudo Mode: el backend lo pide solo si cambian credenciales de Meta (aquí nunca se envían)
  const { sudoFetch } = useSudoMode();
  return async (body: Record<string, unknown>, fallback: string) => {
    const res = await sudoFetch(`${SETTINGS_API_URL}/restaurants/${restaurantId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await apiErrorMessage(res, fallback));
    return res.json() as Promise<RestaurantSettings>;
  };
}
