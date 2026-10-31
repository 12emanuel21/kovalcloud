'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Bike, ChevronDown, Loader2, MapPin, X } from 'lucide-react';

const API_URL = '/api';

interface Driver {
  id: string;
  name: string;
  phone: string;
  vehicleInfo: string | null;
}

export interface DispatchTarget {
  id: string;
  restaurantId: string;
  customerName: string;
  deliveryAddress?: string | null;
}

/** null = el mensaje al cliente dice "15-20 minutos" */
const ETA_OPTIONS: Array<{ label: string; minutes: number | null }> = [
  { label: '15-20 min', minutes: null },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '60 min', minutes: 60 },
];

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('koval_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const message = Array.isArray(data.message) ? data.message.join('. ') : data.message;
  return message || fallback;
}

/**
 * Despacho de un domicilio (KDS): se elige el repartidor en un toque y el backend pasa el pedido
 * a "en camino" y avisa por WhatsApp al cliente y al repartidor (POST /orders/:id/dispatch).
 */
export default function DispatchModal({
  order,
  onClose,
  onDispatched,
}: {
  order: DispatchTarget;
  onClose: () => void;
  onDispatched: (driverName: string) => void;
}) {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({ name: '', phone: '', vehicle: '' });
  const closeRef = useRef<HTMLButtonElement>(null);
  const busy = sendingId !== null;

  useEffect(() => {
    closeRef.current?.focus();
    let cancelled = false;
    fetch(`${API_URL}/restaurants/${encodeURIComponent(order.restaurantId)}/drivers?active=true`, {
      cache: 'no-store',
      headers: authHeaders(),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudieron cargar los repartidores'));
        return res.json() as Promise<Driver[]>;
      })
      .then((data) => {
        if (cancelled) return;
        setDrivers(data);
        if (data.length === 0) setShowManual(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'No se pudieron cargar los repartidores');
      });
    return () => {
      cancelled = true;
    };
  }, [order.restaurantId]);

  // Escape cierra (salvo mientras se envía)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const dispatch = async (key: string, body: Record<string, unknown>, driverName: string) => {
    setSendingId(key);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/orders/${order.id}/dispatch`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ...body, ...(eta ? { estimatedMinutes: eta } : {}) }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo despachar el pedido'));
      onDispatched(driverName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo despachar el pedido');
      setSendingId(null);
    }
  };

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    void dispatch(
      'manual',
      { driverName: manual.name.trim(), driverPhone: manual.phone.trim(), vehicleInfo: manual.vehicle.trim() || undefined },
      manual.name.trim(),
    );
  };

  const fieldClass =
    'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder-slate-500 focus:border-emerald-500';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="dispatch-title">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !busy && onClose()} aria-hidden />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-800 bg-slate-900 shadow-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-800 p-5">
          <div className="min-w-0">
            <p className="font-mono text-xs text-slate-500">#{order.id.slice(0, 8).toUpperCase()} · {order.customerName}</p>
            <h2 id="dispatch-title" className="mt-0.5 text-xl font-bold text-slate-100">
              ¿Quién lleva este domicilio?
            </h2>
            {order.deliveryAddress && (
              <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-400">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{order.deliveryAddress}</span>
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto p-5">
          {/* Tiempo estimado que verá el cliente */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Llega en</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tiempo estimado de entrega">
              {ETA_OPTIONS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={eta === option.minutes}
                  disabled={busy}
                  onClick={() => setEta(option.minutes)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                    eta === option.minutes
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                      : 'border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {error}
            </p>
          )}

          {/* Repartidores: un toque despacha */}
          {loadError ? (
            <p className="text-sm text-rose-300">{loadError}</p>
          ) : drivers === null ? (
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando repartidores...
            </p>
          ) : drivers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-700 px-3 py-3 text-sm text-slate-400">
              No hay repartidores activos. Agrégalos en <span className="font-semibold text-slate-200">Ajustes › Repartidores</span> o
              escribe los datos abajo.
            </p>
          ) : (
            <ul className="space-y-2">
              {drivers.map((driver) => (
                <li key={driver.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => dispatch(driver.id, { driverId: driver.id }, driver.name)}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3.5 text-left transition hover:border-emerald-500 hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                      {sendingId === driver.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bike className="h-5 w-5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-bold text-slate-100">{driver.name}</span>
                      <span className="block truncate text-sm text-slate-400">{driver.vehicleInfo || 'Sin vehículo registrado'}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-emerald-400">
                      {sendingId === driver.id ? 'Enviando...' : 'Despachar'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Repartidor ocasional (no registrado) */}
          {drivers !== null && drivers.length > 0 && (
            <button
              type="button"
              onClick={() => setShowManual((v) => !v)}
              aria-expanded={showManual}
              className="flex items-center gap-1.5 text-sm font-semibold text-slate-400 transition hover:text-slate-200"
            >
              <ChevronDown className={`h-4 w-4 transition ${showManual ? 'rotate-180' : ''}`} /> Otro repartidor
            </button>
          )}
          {showManual && (
            <form onSubmit={submitManual} className="space-y-2.5 rounded-xl border border-slate-800 p-3.5">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <input
                  value={manual.name}
                  onChange={(e) => setManual({ ...manual, name: e.target.value })}
                  placeholder="Nombre"
                  aria-label="Nombre del repartidor"
                  required
                  maxLength={80}
                  className={fieldClass}
                />
                <input
                  type="tel"
                  inputMode="tel"
                  value={manual.phone}
                  onChange={(e) => setManual({ ...manual, phone: e.target.value })}
                  placeholder="Celular (WhatsApp)"
                  aria-label="Celular del repartidor"
                  required
                  maxLength={30}
                  className={fieldClass}
                />
              </div>
              <input
                value={manual.vehicle}
                onChange={(e) => setManual({ ...manual, vehicle: e.target.value })}
                placeholder="Vehículo / placa (opcional)"
                aria-label="Vehículo del repartidor"
                maxLength={80}
                className={fieldClass}
              />
              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {sendingId === 'manual' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bike className="h-4 w-4" />}
                Despachar
              </button>
            </form>
          )}

          <p className="text-xs text-slate-500">
            Al despachar avisamos por WhatsApp al cliente (repartidor, vehículo y enlace para escribirle) y al repartidor
            (dirección, platos y cobro).
          </p>
        </div>
      </div>
    </div>
  );
}
