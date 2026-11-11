'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { SettingsCardHeader, SettingsFeedback, primaryButtonClass, settingsCardClass } from './settings-ui';
import { branchNameOf, useBranches } from './useBranches';
import { BranchSelect } from './BranchSelect';
import { DistancePricingCard } from './DistancePricingCard';

const API_URL = typeof window !== 'undefined' ? '/api' : 'http://koval_backend:4000';

export interface DeliveryZone {
  id: string;
  name: string;
  keywords: string[];
  fee: number;
  isActive: boolean;
  /** Sede que atiende la zona (null = la principal) */
  branchId?: string | null;
}

interface ZoneForm {
  name: string;
  /** Barrios separados por coma */
  keywords: string;
  fee: string;
  branchId: string | null;
}

const EMPTY_FORM: ZoneForm = { name: '', keywords: '', fee: '', branchId: null };

const formatCOP = (value: number) => `$${value.toLocaleString('es-CO')}`;

async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const message = Array.isArray(data.message) ? data.message.join('. ') : data.message;
  return message || fallback;
}

const inputClass =
  'w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';

/**
 * Ajustes > Domicilios: zonas de cobertura con su tarifa. El barrio que escribe el cliente (en la
 * carta o por WhatsApp) se busca en las palabras clave para cobrar el domicilio; fuera de las zonas
 * se le ofrece recoger en el local. Sin zonas, los domicilios no tienen restricción ni flete.
 */
export function DeliveryZonesSection() {
  const { token, restaurantId } = useAuth();
  // Multisede: con sedes creadas, cada zona se asigna a la cocina que la atiende
  const { branches } = useBranches();
  const hasBranches = branches.length > 0;
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // null = sin formulario; 'new' = alta; id = edición
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<ZoneForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [defaultFee, setDefaultFee] = useState<number | null>(null);

  const base = restaurantId ? `${API_URL}/restaurants/${encodeURIComponent(restaurantId)}/delivery-zones` : null;
  const headers = useCallback(
    (): Record<string, string> => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token],
  );

  useEffect(() => {
    if (!base || !token) return;
    let cancelled = false;
    fetch(base, { cache: 'no-store', headers: headers() })
      .then(async (res) => {
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudieron cargar las zonas'));
        return res.json() as Promise<DeliveryZone[]>;
      })
      .then((data) => {
        if (!cancelled) setZones(data);
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

  const openForm = (zone?: DeliveryZone) => {
    setEditing(zone ? zone.id : 'new');
    setForm(
      zone
        ? { name: zone.name, keywords: zone.keywords.join(', '), fee: String(zone.fee), branchId: zone.branchId ?? null }
        : EMPTY_FORM,
    );
    setFeedback(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!base || !editing) return;
    const fee = Number(form.fee.replace(/[^\d]/g, ''));
    if (!Number.isFinite(fee)) {
      setFeedback({ type: 'error', text: 'Escribe la tarifa en pesos (ej. 6000)' });
      return;
    }
    setSaving(true);
    try {
      const isNew = editing === 'new';
      const res = await fetch(isNew ? base : `${base}/${editing}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: headers(),
        body: JSON.stringify({
          name: form.name.trim(),
          keywords: form.keywords.split(',').map((k) => k.trim()).filter(Boolean),
          fee,
          // Multisede: qué cocina atiende los domicilios de esta zona
          ...(hasBranches ? { branchId: form.branchId } : {}),
        }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo guardar la zona'));
      const saved: DeliveryZone = await res.json();
      setZones((prev) => (isNew ? [...prev, saved] : prev.map((z) => (z.id === saved.id ? saved : z))));
      setEditing(null);
      setFeedback({ type: 'success', text: isNew ? `Zona ${saved.name} creada.` : 'Zona actualizada.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo guardar la zona' });
    } finally {
      setSaving(false);
    }
  };

  // Cambio optimista: se revierte si la API lo rechaza
  const toggleActive = async (zone: DeliveryZone) => {
    if (!base) return;
    const isActive = !zone.isActive;
    setBusyId(zone.id);
    setZones((prev) => prev.map((z) => (z.id === zone.id ? { ...z, isActive } : z)));
    try {
      const res = await fetch(`${base}/${zone.id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ isActive }) });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo actualizar la zona'));
    } catch (err) {
      setZones((prev) => prev.map((z) => (z.id === zone.id ? { ...z, isActive: zone.isActive } : z)));
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo actualizar la zona' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (zone: DeliveryZone) => {
    if (!base || !window.confirm(`¿Eliminar la zona ${zone.name}? Los pedidos ya cobrados conservan su domicilio.`)) return;
    setBusyId(zone.id);
    try {
      const res = await fetch(`${base}/${zone.id}`, { method: 'DELETE', headers: headers() });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo eliminar la zona'));
      setZones((prev) => prev.filter((z) => z.id !== zone.id));
      if (editing === zone.id) setEditing(null);
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo eliminar la zona' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <DistancePricingCard />
      <DefaultDeliveryFeeCard onChange={setDefaultFee} />
      <section className={settingsCardClass}>
        <SettingsCardHeader
          title="Zonas de domicilio"
          description="Define los barrios que cubres y cuánto cobras por llevar el pedido. La carta y el bot de WhatsApp calculan el domicilio con el barrio del cliente; si no está en ninguna zona, se cobra la tarifa estándar o, si no tienes, se le ofrece recoger en el local."
          action={
            editing !== 'new' && (
              <button type="button" onClick={() => openForm()} className={primaryButtonClass}>
                <Plus className="h-4 w-4" /> Agregar zona
              </button>
            )
          }
        />

        <div className="space-y-4 p-6">
          <SettingsFeedback feedback={feedback} />

          {editing && (
            <form onSubmit={handleSave} className="space-y-3 rounded-xl border border-emerald-500/30 bg-slate-950/60 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                {editing === 'new' ? 'Nueva zona' : 'Editar zona'}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr_140px]">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-400">Nombre de la zona</span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ej. Norte / Riomar"
                    required
                    maxLength={80}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-400">Barrios (separados por coma)</span>
                  <input
                    value={form.keywords}
                    onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                    placeholder="Ej. Riomar, Alto Prado, Villa Santos"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-400">Tarifa (COP)</span>
                  <input
                    inputMode="numeric"
                    value={form.fee}
                    onChange={(e) => setForm({ ...form, fee: e.target.value })}
                    placeholder="Ej. 6000"
                    required
                    className={inputClass}
                  />
                </label>
              </div>
              {hasBranches && (
                <label className="block sm:max-w-xs">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-400">Sede que atiende la zona</span>
                  <BranchSelect
                    branches={branches}
                    value={form.branchId}
                    onChange={(branchId) => setForm({ ...form, branchId })}
                    emptyLabel="Sede principal (por defecto)"
                    className={inputClass}
                  />
                </label>
              )}
              <p className="text-[11px] text-slate-500">
                El nombre de la zona también cuenta como barrio. No importan las tildes ni las mayúsculas.
                {hasBranches && ' Los domicilios de esta zona sonarán solo en el KDS de la sede elegida.'}
              </p>
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
            <p className="text-xs text-slate-500">Cargando zonas...</p>
          ) : zones.length === 0 ? (
            !editing && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-700 px-6 py-10 text-center">
                <MapPin className="h-8 w-8 text-slate-600" />
                <p className="text-sm font-semibold text-slate-300">Aún no tienes zonas de domicilio</p>
                <p className="max-w-sm text-xs text-slate-500">
                  {defaultFee
                    ? `Mientras no crees ninguna, todos los domicilios pagan la tarifa estándar (${formatCOP(defaultFee)}).`
                    : 'Mientras no crees ninguna, los domicilios se aceptan en cualquier dirección y sin valor de envío.'}
                </p>
              </div>
            )
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Zona</th>
                    <th className="px-4 py-2 font-semibold">Barrios</th>
                    {hasBranches && <th className="px-4 py-2 font-semibold">Sede</th>}
                    <th className="px-4 py-2 text-right font-semibold">Tarifa</th>
                    <th className="px-4 py-2 font-semibold">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {zones.map((zone) => (
                    <tr key={zone.id} className={zone.isActive ? '' : 'opacity-60'}>
                      <td className="px-4 py-3 font-semibold text-white">{zone.name}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{zone.keywords.join(', ') || '—'}</td>
                      {hasBranches && (
                        <td className="px-4 py-3 text-xs text-slate-300">{branchNameOf(branches, zone.branchId, 'Principal')}</td>
                      )}
                      <td className="px-4 py-3 text-right font-mono text-emerald-300">{formatCOP(zone.fee)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={zone.isActive}
                            aria-label={`${zone.name}: ${zone.isActive ? 'activa' : 'inactiva'}`}
                            disabled={busyId === zone.id}
                            onClick={() => toggleActive(zone)}
                            className={`rounded-full border px-3 py-1 text-[11px] font-bold transition disabled:opacity-60 ${
                              zone.isActive
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                : 'border-slate-700 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {zone.isActive ? 'Activa' : 'Inactiva'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openForm(zone)}
                            aria-label={`Editar la zona ${zone.name}`}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(zone)}
                            disabled={busyId === zone.id}
                            aria-label={`Eliminar la zona ${zone.name}`}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-60"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * Tarifa estándar de domicilio (Restaurant.defaultDeliveryFee): se cobra a los barrios que no están en
 * ninguna zona en vez de rechazar el pedido. Se guarda con PATCH /restaurants/:id; null la quita.
 */
function DefaultDeliveryFeeCard({ onChange }: { onChange: (fee: number | null) => void }) {
  const { token, restaurantId } = useAuth();
  const [saved, setSaved] = useState<number | null>(null);
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const url = restaurantId ? `${API_URL}/restaurants/${encodeURIComponent(restaurantId)}` : null;

  useEffect(() => {
    if (!url || !token) return;
    let cancelled = false;
    fetch(url, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo cargar la tarifa estándar'));
        return res.json() as Promise<{ defaultDeliveryFee?: number | null }>;
      })
      .then((data) => {
        if (cancelled) return;
        const fee = data.defaultDeliveryFee ?? null;
        setSaved(fee);
        onChange(fee);
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
  }, [url, token, onChange]);

  const save = async (fee: number | null) => {
    if (!url) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultDeliveryFee: fee }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo guardar la tarifa estándar'));
      const data: { defaultDeliveryFee?: number | null } = await res.json();
      const stored = data.defaultDeliveryFee ?? null;
      setSaved(stored);
      onChange(stored);
      setEditing(false);
      setValue('');
      setFeedback({
        type: 'success',
        text: stored ? `Tarifa estándar guardada: ${formatCOP(stored)} COP.` : 'Tarifa estándar eliminada.',
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo guardar la tarifa estándar' });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fee = Number(value.replace(/[^\d]/g, ''));
    if (!value.trim() || !Number.isFinite(fee) || fee <= 0) {
      setFeedback({ type: 'error', text: 'Escribe la tarifa en pesos (ej. 15000).' });
      return;
    }
    void save(fee);
  };

  const showForm = editing || (!loading && saved === null);

  return (
    <section className={settingsCardClass}>
      <SettingsCardHeader
        title="Tarifa estándar por defecto (Opcional)"
        description="Si cobras lo mismo a toda la ciudad o si un cliente pide a un barrio que no está en la lista de abajo, se cobrará automáticamente este valor en lugar de rechazar el pedido."
      />
      <div className="space-y-3 p-6">
        <SettingsFeedback feedback={feedback} />
        {loading ? (
          <p className="text-xs text-slate-500">Cargando tarifa...</p>
        ) : showForm ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block sm:w-56">
              <span className="sr-only">Tarifa estándar en pesos</span>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
              <input
                inputMode="numeric"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Ej. 15000"
                className={`${inputClass} pl-7`}
              />
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className={primaryButtonClass}>
                {saving ? 'Guardando...' : 'Guardar Tarifa Estándar'}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setValue('');
                  }}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Tarifa estándar</p>
              <p className="font-mono text-lg font-bold text-emerald-300">{formatCOP(saved ?? 0)} COP</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setValue(String(saved ?? ''));
                setFeedback(null);
              }}
              aria-label="Editar la tarifa estándar"
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (window.confirm('¿Eliminar la tarifa estándar? Los barrios fuera de tus zonas quedarán sin cobertura.')) void save(null);
              }}
              aria-label="Eliminar la tarifa estándar"
              className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
