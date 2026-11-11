'use client';

import React, { useEffect, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { SettingsCardHeader, SettingsFeedback, primaryButtonClass, settingsCardClass } from './settings-ui';

const API_URL = typeof window !== 'undefined' ? '/api' : 'http://koval_backend:4000';

/** Parámetros de domicilio por distancia guardados en el restaurante */
interface DistanceSettings {
  latitude: number | null;
  longitude: number | null;
  baseDeliveryFee: number;
  baseDeliveryKm: number;
  extraKmFee: number;
  maxDeliveryRadiusKm: number;
}

type FormState = Record<keyof DistanceSettings, string>;

const DEFAULTS: DistanceSettings = {
  latitude: null,
  longitude: null,
  baseDeliveryFee: 4000,
  baseDeliveryKm: 2,
  extraKmFee: 1500,
  maxDeliveryRadiusKm: 8,
};

const toForm = (s: DistanceSettings): FormState => ({
  latitude: s.latitude === null ? '' : String(s.latitude),
  longitude: s.longitude === null ? '' : String(s.longitude),
  baseDeliveryFee: String(s.baseDeliveryFee),
  baseDeliveryKm: String(s.baseDeliveryKm).replace('.', ','),
  extraKmFee: String(s.extraKmFee),
  maxDeliveryRadiusKm: String(s.maxDeliveryRadiusKm).replace('.', ','),
});

/** "2,5" o "2.5" -> 2.5; vacío o inválido -> NaN */
const parseDecimal = (value: string) => (value.trim() ? Number(value.trim().replace(/\s/g, '').replace(',', '.')) : Number.NaN);
/** "$ 4.000" -> 4000 */
const parsePesos = (value: string) => (value.trim() ? Number(value.replace(/[^\d]/g, '')) : Number.NaN);

const formatCOP = (value: number) => `$${Math.round(value).toLocaleString('es-CO')}`;
const formatKm = (value: number) => value.toLocaleString('es-CO', { maximumFractionDigits: 1 });

/** Mismo escalonamiento que el backend (base hasta la distancia base, luego cada km iniciado) */
function previewFee(km: number, s: Pick<DistanceSettings, 'baseDeliveryFee' | 'baseDeliveryKm' | 'extraKmFee'>) {
  if (km <= s.baseDeliveryKm) return s.baseDeliveryFee;
  return s.baseDeliveryFee + Math.ceil(Math.round((km - s.baseDeliveryKm) * 10) / 10) * s.extraKmFee;
}

async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const message = Array.isArray(data.message) ? data.message.join('. ') : data.message;
  return message || fallback;
}

const inputClass =
  'w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';

/**
 * Ajustes > Domicilios: domicilio por distancia. Con las coordenadas del local, el envío se cobra
 * por los km entre el local (o la sede más cercana) y el pin del cliente: Haversine x 1.30.
 * Sin coordenadas el cálculo por distancia está apagado y aplican las zonas / la tarifa estándar.
 */
export function DistancePricingCard() {
  const { token, restaurantId } = useAuth();
  const [saved, setSaved] = useState<DistanceSettings>(DEFAULTS);
  const [form, setForm] = useState<FormState>(toForm(DEFAULTS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const url = restaurantId ? `${API_URL}/restaurants/${encodeURIComponent(restaurantId)}` : null;

  useEffect(() => {
    if (!url || !token) return;
    let cancelled = false;
    fetch(url, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudieron cargar los parámetros de distancia'));
        return res.json() as Promise<Partial<DistanceSettings>>;
      })
      .then((data) => {
        if (cancelled) return;
        const settings: DistanceSettings = {
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          baseDeliveryFee: data.baseDeliveryFee ?? DEFAULTS.baseDeliveryFee,
          baseDeliveryKm: data.baseDeliveryKm ?? DEFAULTS.baseDeliveryKm,
          extraKmFee: data.extraKmFee ?? DEFAULTS.extraKmFee,
          maxDeliveryRadiusKm: data.maxDeliveryRadiusKm ?? DEFAULTS.maxDeliveryRadiusKm,
        };
        setSaved(settings);
        setForm(toForm(settings));
      })
      .catch((err: unknown) => {
        if (!cancelled) setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Error al cargar' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, token]);

  const isActive = saved.latitude !== null && saved.longitude !== null;

  /** Pegar "10.9878, -74.7889" (copiado de Google Maps) en la latitud llena los dos campos */
  const setLatitude = (value: string) => {
    const pair = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(value);
    setForm((prev) => (pair ? { ...prev, latitude: pair[1], longitude: pair[2] } : { ...prev, latitude: value }));
  };

  const fillFromCurrentPosition = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setFeedback({ type: 'error', text: 'Este navegador no permite obtener la ubicación. Escribe las coordenadas.' });
      return;
    }
    setLocating(true);
    setFeedback(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setForm((prev) => ({
          ...prev,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }));
      },
      () => {
        setLocating(false);
        setFeedback({ type: 'error', text: 'No pudimos obtener la ubicación. Cópiala de Google Maps (clic derecho sobre el local).' });
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const patch = async (body: Partial<DistanceSettings>, okText: string) => {
    if (!url) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudieron guardar los parámetros'));
      const data: Partial<DistanceSettings> = await res.json();
      const next: DistanceSettings = {
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        baseDeliveryFee: data.baseDeliveryFee ?? saved.baseDeliveryFee,
        baseDeliveryKm: data.baseDeliveryKm ?? saved.baseDeliveryKm,
        extraKmFee: data.extraKmFee ?? saved.extraKmFee,
        maxDeliveryRadiusKm: data.maxDeliveryRadiusKm ?? saved.maxDeliveryRadiusKm,
      };
      setSaved(next);
      setForm(toForm(next));
      setFeedback({ type: 'success', text: okText });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudieron guardar los parámetros' });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const latitude = parseDecimal(form.latitude);
    const longitude = parseDecimal(form.longitude);
    const values = {
      baseDeliveryFee: parsePesos(form.baseDeliveryFee),
      baseDeliveryKm: parseDecimal(form.baseDeliveryKm),
      extraKmFee: parsePesos(form.extraKmFee),
      maxDeliveryRadiusKm: parseDecimal(form.maxDeliveryRadiusKm),
    };
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      setFeedback({ type: 'error', text: 'Escribe la latitud y la longitud del local (ej. 10.9878 y -74.7889).' });
      return;
    }
    if (Object.values(values).some((v) => !Number.isFinite(v) || v < 0) || values.maxDeliveryRadiusKm < 0.5) {
      setFeedback({ type: 'error', text: 'Revisa la tarifa base, la distancia base, el km adicional y el radio máximo.' });
      return;
    }
    void patch({ latitude, longitude, ...values }, 'Parámetros guardados. Los domicilios con ubicación se cobran por distancia.');
  };

  const disable = () => {
    if (!window.confirm('¿Quitar las coordenadas del local? Los domicilios volverán a cobrarse por zonas o la tarifa estándar.')) return;
    void patch({ latitude: null, longitude: null }, 'Cálculo por distancia desactivado.');
  };

  // Ejemplo con lo que está escrito (si es válido)
  const example = (() => {
    const s = {
      baseDeliveryFee: parsePesos(form.baseDeliveryFee),
      baseDeliveryKm: parseDecimal(form.baseDeliveryKm),
      extraKmFee: parsePesos(form.extraKmFee),
    };
    if (Object.values(s).some((v) => !Number.isFinite(v))) return null;
    const km = Math.round((s.baseDeliveryKm + 1.5) * 10) / 10;
    return `Ej.: hasta ${formatKm(s.baseDeliveryKm)} km se cobran ${formatCOP(s.baseDeliveryFee)}; a ${formatKm(km)} km, ${formatCOP(previewFee(km, s))}.`;
  })();

  const field = (key: keyof FormState, label: string, props: React.InputHTMLAttributes<HTMLInputElement> & { prefix?: string }) => {
    const { prefix, ...inputProps } = props;
    return (
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold text-slate-400">{label}</span>
        <span className="relative block">
          {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">{prefix}</span>}
          <input
            value={form[key]}
            onChange={(e) => (key === 'latitude' ? setLatitude(e.target.value) : setForm({ ...form, [key]: e.target.value }))}
            className={`${inputClass} ${prefix ? 'pl-7' : ''}`}
            {...inputProps}
          />
        </span>
      </label>
    );
  };

  return (
    <section className={settingsCardClass}>
      <SettingsCardHeader
        title="Parámetros de Domicilio por Distancia"
        description="Con la ubicación del local, el envío se calcula solo con el pin del cliente (WhatsApp o “Usar mi ubicación” en la carta): distancia en línea recta x 1,30 por las calles. Sin coordenadas se usan las zonas y la tarifa estándar de abajo."
        action={
          !loading && (
            <span
              className={`rounded-full border px-3 py-1 text-[11px] font-bold ${
                isActive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 text-slate-400'
              }`}
            >
              {isActive ? 'Activo' : 'Inactivo'}
            </span>
          )
        }
      />
      <div className="space-y-4 p-6">
        <SettingsFeedback feedback={feedback} />
        {loading ? (
          <p className="text-xs text-slate-500">Cargando parámetros...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Coordenadas del local</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                {field('latitude', 'Latitud', { inputMode: 'decimal', placeholder: 'Ej. 10.9878', 'aria-label': 'Latitud del local' })}
                {field('longitude', 'Longitud', { inputMode: 'decimal', placeholder: 'Ej. -74.7889', 'aria-label': 'Longitud del local' })}
                <button
                  type="button"
                  onClick={fillFromCurrentPosition}
                  disabled={locating}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-emerald-500/40 hover:text-white disabled:opacity-60"
                >
                  <LocateFixed className="h-4 w-4" /> {locating ? 'Ubicando...' : 'Estoy en el local'}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                En Google Maps, clic derecho sobre el local y copia los números; puedes pegarlos juntos en Latitud.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {field('baseDeliveryFee', 'Tarifa Base ($)', { inputMode: 'numeric', prefix: '$', placeholder: '4000' })}
              {field('baseDeliveryKm', 'Distancia Base (km)', { inputMode: 'decimal', placeholder: '2' })}
              {field('extraKmFee', 'Valor km adicional ($)', { inputMode: 'numeric', prefix: '$', placeholder: '1500' })}
              {field('maxDeliveryRadiusKm', 'Radio Máximo (km)', { inputMode: 'decimal', placeholder: '8' })}
            </div>
            {example && <p className="text-[11px] text-slate-400">{example} Más allá del radio máximo se ofrece recoger en el local.</p>}
            <div className="flex flex-wrap justify-end gap-2">
              {isActive && (
                <button
                  type="button"
                  onClick={disable}
                  disabled={saving}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-60"
                >
                  Desactivar
                </button>
              )}
              <button type="submit" disabled={saving} className={primaryButtonClass}>
                {saving ? 'Guardando...' : 'Guardar parámetros'}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
