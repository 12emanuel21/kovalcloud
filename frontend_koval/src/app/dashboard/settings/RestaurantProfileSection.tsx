'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

const API_URL = typeof window !== 'undefined' ? '/api' : 'http://koval_backend:4000';

// Mismo formato que valida el backend (restaurants/business-hours.ts)
const WEEK_DAYS = [
  { key: 'monday', label: 'Lunes' },
  { key: 'tuesday', label: 'Martes' },
  { key: 'wednesday', label: 'Miércoles' },
  { key: 'thursday', label: 'Jueves' },
  { key: 'friday', label: 'Viernes' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
] as const;

type WeekDay = (typeof WEEK_DAYS)[number]['key'];

interface TimeRange {
  open: string;
  close: string;
}

type BusinessHours = Partial<Record<WeekDay, TimeRange[]>>;

/** Estado del editor por día: el MVP edita una franja; las adicionales se conservan */
interface DayState {
  enabled: boolean;
  open: string;
  close: string;
  extraRanges: TimeRange[];
}

type HoursState = Record<WeekDay, DayState>;

interface RestaurantConfig {
  address?: string | null;
  paymentDetails?: string | null;
  businessHours?: BusinessHours | null;
  isTemporarilyClosed?: boolean;
  closedMessage?: string | null;
}

const DEFAULT_OPEN = '11:00';
const DEFAULT_CLOSE = '22:00';

function toHoursState(hours: BusinessHours | null | undefined): HoursState {
  const state = {} as HoursState;
  for (const { key } of WEEK_DAYS) {
    const [first, ...rest] = hours?.[key] ?? [];
    state[key] = {
      enabled: Boolean(first),
      open: first?.open ?? DEFAULT_OPEN,
      close: first?.close ?? DEFAULT_CLOSE,
      extraRanges: rest,
    };
  }
  return state;
}

function toBusinessHours(state: HoursState): BusinessHours {
  const hours: BusinessHours = {};
  for (const { key } of WEEK_DAYS) {
    const day = state[key];
    hours[key] = day.enabled ? [{ open: day.open, close: day.close }, ...day.extraRanges] : [];
  }
  return hours;
}

/** Devuelve el primer error del horario, o null si es válido */
function validateHours(state: HoursState): string | null {
  for (const { key, label } of WEEK_DAYS) {
    const day = state[key];
    if (!day.enabled) continue;
    if (!day.open || !day.close) return `${label}: indica la hora de apertura y de cierre`;
    if (day.open === day.close) return `${label}: la apertura y el cierre no pueden ser iguales`;
  }
  return null;
}

/** Mensaje legible de un error de la API (ValidationPipe devuelve message como arreglo) */
async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const message = Array.isArray(data.message) ? data.message.join('. ') : data.message;
  return message || fallback;
}

const inputClass =
  'w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white outline-none transition';

/**
 * Perfil operativo del local: dirección, datos de pago, horarios y cierre de emergencia.
 * Guarda con PATCH /restaurants/:id/config (solo OWNER del local o SUPERADMIN).
 */
export function RestaurantProfileSection() {
  const { restaurantId, token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [address, setAddress] = useState('');
  const [paymentDetails, setPaymentDetails] = useState('');
  const [isTemporarilyClosed, setIsTemporarilyClosed] = useState(false);
  const [closedMessage, setClosedMessage] = useState('');
  const [hours, setHours] = useState<HoursState>(() => toHoursState(null));

  // Carga inicial: setState solo en callbacks de la promesa (nunca síncrono en el efecto)
  useEffect(() => {
    if (!restaurantId || !token) return;
    let cancelled = false;
    fetch(`${API_URL}/restaurants/${restaurantId}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo cargar el perfil del local'));
        return res.json() as Promise<RestaurantConfig>;
      })
      .then((data) => {
        if (cancelled) return;
        setAddress(data.address ?? '');
        setPaymentDetails(data.paymentDetails ?? '');
        setIsTemporarilyClosed(Boolean(data.isTemporarilyClosed));
        setClosedMessage(data.closedMessage ?? '');
        setHours(toHoursState(data.businessHours));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo cargar el perfil del local' });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, token]);

  const updateDay = (key: WeekDay, patch: Partial<DayState>) =>
    setHours((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const hoursError = validateHours(hours);
    if (hoursError) {
      setFeedback({ type: 'error', text: hoursError });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const payload: RestaurantConfig = {
        address: address.trim(),
        paymentDetails: paymentDetails.trim(),
        businessHours: toBusinessHours(hours),
        isTemporarilyClosed,
        closedMessage: closedMessage.trim(),
      };
      const res = await fetch(`${API_URL}/restaurants/${restaurantId}/config`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo guardar el perfil del local'));
      setFeedback({ type: 'success', text: 'Perfil del local guardado correctamente.' });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo guardar el perfil del local' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 md:p-8 text-xs text-slate-500">
        Cargando perfil del local...
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSave}
      className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-sm border border-amber-500/20">
          🏪
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Perfil del Local</h2>
          <p className="text-xs text-slate-400">Dirección, medios de pago, horarios de atención y cierre de emergencia.</p>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs border ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Cierre de emergencia */}
      <div
        className={`p-4 rounded-2xl border space-y-3 transition ${
          isTemporarilyClosed ? 'bg-rose-500/10 border-rose-500/40' : 'bg-slate-950/60 border-slate-800/80'
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className={`text-sm font-bold ${isTemporarilyClosed ? 'text-rose-300' : 'text-white'}`}>
              Cierre de Emergencia
            </h3>
            <p className="text-[11px] text-slate-400">
              Marca el local como cerrado temporalmente, sin importar el horario.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isTemporarilyClosed}
            aria-label="Cierre de emergencia"
            onClick={() => setIsTemporarilyClosed((v) => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition cursor-pointer ${
              isTemporarilyClosed ? 'bg-rose-600 border-rose-500' : 'bg-slate-700 border-slate-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                isTemporarilyClosed ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Mensaje de Cierre</label>
          <input
            type="text"
            value={closedMessage}
            onChange={(e) => setClosedMessage(e.target.value)}
            placeholder="Ej. Hoy cerramos por mantenimiento, volvemos mañana a las 11:00"
            maxLength={300}
            className={inputClass}
          />
        </div>
      </div>

      {/* Dirección y pagos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Dirección</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ej. Cra 45 # 26-85, Barrio Centro"
            maxLength={300}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Datos de Pago / Nequi</label>
          <textarea
            value={paymentDetails}
            onChange={(e) => setPaymentDetails(e.target.value)}
            placeholder={'Ej. Nequi 300 123 4567 (Juan Pérez)\nEfectivo y datáfono en el local'}
            rows={3}
            maxLength={1000}
            className={`${inputClass} resize-y`}
          />
        </div>
      </div>

      {/* Horarios */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-white">Horarios de Atención</h3>
        <p className="text-[11px] text-slate-400">
          Si el cierre es menor que la apertura (ej. 18:00 → 02:00), se entiende que cierra pasada la medianoche.
        </p>
        <div className="border border-slate-800/80 rounded-2xl divide-y divide-slate-800/60 bg-slate-950/40">
          {WEEK_DAYS.map(({ key, label }) => {
            const day = hours[key];
            return (
              <div key={key} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <label className="flex items-center gap-2 w-32 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={day.enabled}
                    onChange={(e) => updateDay(key, { enabled: e.target.checked })}
                    className="h-4 w-4 accent-emerald-500"
                  />
                  <span className={`text-xs font-semibold ${day.enabled ? 'text-white' : 'text-slate-500'}`}>{label}</span>
                </label>
                {day.enabled ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <input
                      type="time"
                      value={day.open}
                      onChange={(e) => updateDay(key, { open: e.target.value })}
                      aria-label={`${label}: apertura`}
                      required
                      className="bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-lg px-2 py-1 text-white outline-none [color-scheme:dark]"
                    />
                    <span>a</span>
                    <input
                      type="time"
                      value={day.close}
                      onChange={(e) => updateDay(key, { close: e.target.value })}
                      aria-label={`${label}: cierre`}
                      required
                      className="bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-lg px-2 py-1 text-white outline-none [color-scheme:dark]"
                    />
                    {day.extraRanges.length > 0 && (
                      <span className="text-[10px] text-slate-500">
                        +{day.extraRanges.length} franja{day.extraRanges.length > 1 ? 's' : ''} adicional
                        {day.extraRanges.length > 1 ? 'es' : ''}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">Cerrado</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold transition shadow-md shadow-emerald-950/50 cursor-pointer"
        >
          {saving ? 'Guardando...' : 'Guardar Perfil del Local'}
        </button>
      </div>
    </form>
  );
}
