'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Bike, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { SettingsCardHeader, SettingsFeedback, primaryButtonClass, settingsCardClass } from './settings-ui';

const API_URL = typeof window !== 'undefined' ? '/api' : 'http://koval_backend:4000';

export interface Driver {
  id: string;
  name: string;
  phone: string;
  vehicleInfo: string | null;
  isActive: boolean;
}

interface DriverForm {
  name: string;
  phone: string;
  vehicleInfo: string;
}

const EMPTY_FORM: DriverForm = { name: '', phone: '', vehicleInfo: '' };

/** "573001234567" -> "+57 300 123 4567" */
export function formatDriverPhone(digits: string): string {
  const co = /^57(\d{3})(\d{3})(\d{4})$/.exec(digits);
  return co ? `+57 ${co[1]} ${co[2]} ${co[3]}` : `+${digits}`;
}

async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const message = Array.isArray(data.message) ? data.message.join('. ') : data.message;
  return message || fallback;
}

const inputClass =
  'w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';

/**
 * Ajustes > Repartidores: domiciliarios del local. El KDS ofrece los activos al despachar un domicilio,
 * y el cliente recibe por WhatsApp su nombre, vehículo y un enlace para escribirle.
 */
export function DriversSection() {
  const { token, restaurantId } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // null = sin formulario; 'new' = alta; id = edición
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<DriverForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const base = restaurantId ? `${API_URL}/restaurants/${encodeURIComponent(restaurantId)}/drivers` : null;
  const headers = useCallback(
    (): Record<string, string> => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token],
  );

  useEffect(() => {
    if (!base || !token) return;
    let cancelled = false;
    fetch(base, { cache: 'no-store', headers: headers() })
      .then(async (res) => {
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudieron cargar los repartidores'));
        return res.json() as Promise<Driver[]>;
      })
      .then((data) => {
        if (!cancelled) setDrivers(data);
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
  }, [base, token, headers]);

  const openForm = (driver?: Driver) => {
    setEditing(driver ? driver.id : 'new');
    setForm(driver ? { name: driver.name, phone: driver.phone, vehicleInfo: driver.vehicleInfo ?? '' } : EMPTY_FORM);
    setFeedback(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!base || !editing) return;
    setSaving(true);
    try {
      const isNew = editing === 'new';
      const res = await fetch(isNew ? base : `${base}/${editing}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: headers(),
        body: JSON.stringify({ name: form.name.trim(), phone: form.phone.trim(), vehicleInfo: form.vehicleInfo.trim() || null }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo guardar el repartidor'));
      const saved: Driver = await res.json();
      setDrivers((prev) => (isNew ? [...prev, saved] : prev.map((d) => (d.id === saved.id ? saved : d))));
      setEditing(null);
      setFeedback({ type: 'success', text: isNew ? `${saved.name} quedó disponible en el KDS.` : 'Repartidor actualizado.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo guardar el repartidor' });
    } finally {
      setSaving(false);
    }
  };

  // Cambio optimista: se revierte si la API lo rechaza
  const toggleActive = async (driver: Driver) => {
    if (!base) return;
    const isActive = !driver.isActive;
    setBusyId(driver.id);
    setDrivers((prev) => prev.map((d) => (d.id === driver.id ? { ...d, isActive } : d)));
    try {
      const res = await fetch(`${base}/${driver.id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ isActive }) });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo actualizar el repartidor'));
    } catch (err) {
      setDrivers((prev) => prev.map((d) => (d.id === driver.id ? { ...d, isActive: driver.isActive } : d)));
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo actualizar el repartidor' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (driver: Driver) => {
    if (!base || !window.confirm(`¿Eliminar a ${driver.name}? Los pedidos que entregó conservan sus datos.`)) return;
    setBusyId(driver.id);
    try {
      const res = await fetch(`${base}/${driver.id}`, { method: 'DELETE', headers: headers() });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo eliminar el repartidor'));
      setDrivers((prev) => prev.filter((d) => d.id !== driver.id));
      if (editing === driver.id) setEditing(null);
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo eliminar el repartidor' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className={settingsCardClass}>
      <SettingsCardHeader
        title="Repartidores / Domiciliarios"
        description="Al despachar un domicilio desde el KDS eliges quién lo lleva. El cliente recibe por WhatsApp su nombre, vehículo y un enlace para escribirle; el repartidor, la dirección y lo que debe cobrar."
        action={
          editing !== 'new' && (
            <button type="button" onClick={() => openForm()} className={primaryButtonClass}>
              <Plus className="h-4 w-4" /> Agregar repartidor
            </button>
          )
        }
      />

      <div className="space-y-4 p-6">
        <SettingsFeedback feedback={feedback} />

        {editing && (
          <form onSubmit={handleSave} className="space-y-3 rounded-xl border border-emerald-500/30 bg-slate-950/60 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              {editing === 'new' ? 'Nuevo repartidor' : 'Editar repartidor'}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-400">Nombre</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej. Juan Pérez"
                  required
                  maxLength={80}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-400">Celular (WhatsApp)</span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="Ej. 300 123 4567"
                  required
                  maxLength={30}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-400">Vehículo / Placa (opcional)</span>
                <input
                  value={form.vehicleInfo}
                  onChange={(e) => setForm({ ...form, vehicleInfo: e.target.value })}
                  placeholder="Ej. Moto AKT · ABC12D"
                  maxLength={80}
                  className={inputClass}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button type="submit" disabled={saving} className={primaryButtonClass}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-xs text-slate-500">Cargando repartidores...</p>
        ) : drivers.length === 0 ? (
          !editing && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-700 px-6 py-10 text-center">
              <Bike className="h-8 w-8 text-slate-600" />
              <p className="text-sm font-semibold text-slate-300">Aún no tienes repartidores</p>
              <p className="max-w-sm text-xs text-slate-500">
                Agrégalos para despachar domicilios en un toque desde el KDS. También puedes despachar con datos sueltos.
              </p>
            </div>
          )
        ) : (
          <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800">
            {drivers.map((driver) => (
              <li key={driver.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                    driver.isActive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 text-slate-500'
                  }`}
                >
                  <Bike className="h-4 w-4" />
                </span>
                <div className={`min-w-0 flex-1 ${driver.isActive ? '' : 'opacity-60'}`}>
                  <p className="truncate text-sm font-semibold text-white">{driver.name}</p>
                  <p className="truncate text-xs text-slate-400">
                    {formatDriverPhone(driver.phone)}
                    {driver.vehicleInfo ? ` · ${driver.vehicleInfo}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={driver.isActive}
                  aria-label={`${driver.name}: ${driver.isActive ? 'activo' : 'inactivo'}`}
                  disabled={busyId === driver.id}
                  onClick={() => toggleActive(driver)}
                  className={`rounded-full border px-3 py-1 text-[11px] font-bold transition disabled:opacity-60 ${
                    driver.isActive
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : 'border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {driver.isActive ? 'Activo' : 'Inactivo'}
                </button>
                <button
                  type="button"
                  onClick={() => openForm(driver)}
                  aria-label={`Editar a ${driver.name}`}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(driver)}
                  disabled={busyId === driver.id}
                  aria-label={`Eliminar a ${driver.name}`}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
