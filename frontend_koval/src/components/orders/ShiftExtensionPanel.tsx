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

/** Se emite al guardar horarios o el cierre de emergencia en Ajustes: el panel vuelve a leer el estado */
export const SHIFT_CHANGED_EVENT = 'koval:shift-changed';

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
 * Panel "Turno / Horario" (Kanban de pedidos y Ajustes > Horarios): muestra si el local recibe pedidos,
 * permite prorrogar el horario (+30 min, +1 h o minutos a medida) y, con tiempo extra activo,
 * terminarlo al instante ("Cerrar ahora"). La carta pública lo refleja en segundos.
 * Para el OWNER y el SUPERADMIN (en Modo Dios); el backend también lo exige.
 */
export function ShiftExtensionPanel() {
  const { user, restaurantId, token } = useAuth();
  // OWNER de su local, o SUPERADMIN en Modo Dios (el backend permite ambos)
  const canManage = user?.role === 'OWNER' || user?.role === 'SUPERADMIN';

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

  // Recarga cuando Ajustes guarda horarios o el cierre de emergencia
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const onChanged = () => setReloadKey((key) => key + 1);
    window.addEventListener(SHIFT_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(SHIFT_CHANGED_EVENT, onChanged);
  }, []);

  // Carga del estado: setState solo en callbacks de la promesa (nunca síncrono en el efecto)
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
        setNow(new Date());
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar el estado del turno');
      });
    return () => {
      cancelled = true;
    };
  }, [canManage, restaurantId, token, reloadKey]);

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

  // Kill switch: con la emergencia activa no hay prórroga posible (el backend la borra y rechaza nuevas)
  const emergency = Boolean(shift?.isTemporarilyClosed);
  const extensionActive = shift && !emergency ? hasActiveExtension(shift.extendedUntil, now) : false;
  // Terminar el tiempo extra cierra el local solo si ya pasó el horario regular
  const openBySchedule = shift ? isWithinBusinessHours(shift.businessHours, now) : false;
  const status = !shift
    ? { tone: 'muted', text: 'Cargando estado del turno...' }
    : emergency
      ? { tone: 'closed', text: '🔴 Cierre de emergencia activo: no se reciben pedidos' }
      : extensionActive
        ? { tone: 'extended', text: `🟢 Prórroga activa hasta las ${formatLocalTime(shift.extendedUntil!)}` }
        : openBySchedule
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
          : emergency
            ? 'bg-rose-500/10 border-rose-500/40 shadow-lg shadow-rose-950/30'
            : 'bg-slate-900/80 border-slate-800'
      }`}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Turno / Horario</p>
        <p className={`text-xs font-semibold ${toneClass[status.tone]}`}>{status.text}</p>
        {error && <p className="text-[11px] text-rose-400">{error}</p>}
      </div>

      {emergency ? (
        <p className="text-[11px] text-rose-200/80 lg:text-right">
          Desactiva el cierre de emergencia en Ajustes para poder prorrogar el horario.
        </p>
      ) : (
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
              title={
                openBySchedule
                  ? 'Termina el tiempo extra; el local sigue abierto según su horario'
                  : 'Termina el tiempo extra y deja de recibir pedidos de inmediato'
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400 bg-rose-600 px-3.5 py-1.5 text-[11px] font-bold text-white shadow-md shadow-rose-950/40 transition hover:bg-rose-500 disabled:opacity-60 disabled:cursor-wait cursor-pointer"
            >
              <span aria-hidden>⏹</span>
              {busy ? 'Cerrando...' : openBySchedule ? 'Finalizar tiempo extra' : 'Cerrar ahora'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
