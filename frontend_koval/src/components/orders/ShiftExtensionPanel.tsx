'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  type BusinessHours,
  formatLocalTime,
  hasActiveExtension,
  isWithinBusinessHours,
} from '@/lib/business-hours';

const API_URL = typeof window !== 'undefined' ? '/api' : 'http://koval_backend:4000';

/** Debe coincidir con el máximo del backend (ExtendHoursDto) */
const MAX_EXTENSION_MINUTES = 720;

interface ShiftState {
  extendedUntil: string | null;
  isTemporarilyClosed: boolean;
  businessHours: BusinessHours | null;
}

async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const message = Array.isArray(data.message) ? data.message.join('. ') : data.message;
  return message || fallback;
}

/**
 * Panel "Turno / Horario" del Kanban: muestra si el local recibe pedidos y permite
 * prorrogar el horario (+30 min, +1 h o minutos a medida) o cancelar la prórroga.
 * Solo para el OWNER (el backend también lo exige).
 */
export function ShiftExtensionPanel() {
  const { user, restaurantId, token } = useAuth();
  const canManage = user?.role === 'OWNER';

  const [shift, setShift] = useState<ShiftState | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [customMinutes, setCustomMinutes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reloj para que el indicador cambie solo cuando la prórroga o el horario vencen
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Carga inicial: setState solo en callbacks de la promesa (nunca síncrono en el efecto)
  useEffect(() => {
    if (!canManage || !restaurantId || !token) return;
    let cancelled = false;
    fetch(`${API_URL}/restaurants/${restaurantId}`, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo cargar el estado del turno'));
        return res.json() as Promise<Partial<ShiftState>>;
      })
      .then((data) => {
        if (cancelled) return;
        setShift({
          extendedUntil: data.extendedUntil ?? null,
          isTemporarilyClosed: Boolean(data.isTemporarilyClosed),
          businessHours: data.businessHours ?? null,
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar el estado del turno');
      });
    return () => {
      cancelled = true;
    };
  }, [canManage, restaurantId, token]);

  if (!canManage) return null;

  const extend = async (minutes: number | null) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/restaurants/${restaurantId}/extend-hours`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo actualizar la prórroga'));
      const data: { extendedUntil: string | null } = await res.json();
      setShift((prev) => (prev ? { ...prev, extendedUntil: data.extendedUntil } : prev));
      setNow(new Date());
      setCustomMinutes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la prórroga');
    } finally {
      setBusy(false);
    }
  };

  const handleCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const minutes = Number(customMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_EXTENSION_MINUTES) {
      setError(`Indica un número entero de minutos entre 1 y ${MAX_EXTENSION_MINUTES}`);
      return;
    }
    extend(minutes);
  };

  const extensionActive = shift ? hasActiveExtension(shift.extendedUntil, now) : false;
  const status = !shift
    ? { tone: 'muted', text: 'Cargando estado del turno...' }
    : extensionActive
      ? { tone: 'extended', text: `🟢 Prórroga activa hasta las ${formatLocalTime(shift.extendedUntil!)}` }
      : shift.isTemporarilyClosed
        ? { tone: 'closed', text: '🔴 Cierre de emergencia activo: no se reciben pedidos' }
        : isWithinBusinessHours(shift.businessHours, now)
          ? { tone: 'open', text: '🟢 Abierto según el horario' }
          : { tone: 'closed', text: '🌙 Fuera de horario: no se reciben pedidos' };

  const toneClass: Record<string, string> = {
    muted: 'text-slate-400',
    extended: 'text-emerald-300',
    open: 'text-emerald-400',
    closed: 'text-rose-300',
  };

  const quickButton =
    'px-3 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer disabled:opacity-50 disabled:cursor-wait';

  return (
    <section
      aria-label="Turno y horario"
      className={`rounded-2xl border p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 transition ${
        extensionActive
          ? 'bg-emerald-500/10 border-emerald-500/40 shadow-lg shadow-emerald-950/30'
          : 'bg-slate-900/80 border-slate-800'
      }`}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Turno / Horario</p>
        <p className={`text-xs font-semibold ${toneClass[status.tone]}`}>{status.text}</p>
        {error && <p className="text-[11px] text-rose-400">{error}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => extend(30)}
          disabled={busy || !shift}
          className={`${quickButton} bg-slate-800 border-slate-700 text-slate-200 hover:border-emerald-500 hover:text-emerald-300`}
        >
          +30 min
        </button>
        <button
          type="button"
          onClick={() => extend(60)}
          disabled={busy || !shift}
          className={`${quickButton} bg-slate-800 border-slate-700 text-slate-200 hover:border-emerald-500 hover:text-emerald-300`}
        >
          +1 hora
        </button>

        <form onSubmit={handleCustom} className="flex items-center gap-1.5">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_EXTENSION_MINUTES}
            step={1}
            value={customMinutes}
            onChange={(e) => setCustomMinutes(e.target.value)}
            placeholder="min"
            aria-label="Minutos de prórroga personalizados"
            className="w-16 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-2 py-1.5 text-[11px] text-white outline-none [color-scheme:dark]"
          />
          <button
            type="submit"
            disabled={busy || !shift || !customMinutes}
            className={`${quickButton} bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500`}
          >
            Aplicar
          </button>
        </form>

        {extensionActive && (
          <button
            type="button"
            onClick={() => extend(null)}
            disabled={busy}
            className={`${quickButton} bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20`}
          >
            Cancelar Prórroga
          </button>
        )}
      </div>
    </section>
  );
}
