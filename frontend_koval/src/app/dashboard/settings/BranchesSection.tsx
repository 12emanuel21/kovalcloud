'use client';

import React, { useState } from 'react';
import { Building2, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { SettingsCardHeader, SettingsFeedback, primaryButtonClass, settingsCardClass } from './settings-ui';
import { branchApiError, useBranches, type Branch } from './useBranches';

interface BranchForm {
  name: string;
  address: string;
  phone: string;
  isMain: boolean;
}

const EMPTY_FORM: BranchForm = { name: '', address: '', phone: '', isMain: false };

const inputClass =
  'w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';

/** La lista siempre muestra primero la principal y luego las activas */
const sortBranches = (list: Branch[]) =>
  [...list].sort(
    (a, b) => Number(b.isMain) - Number(a.isMain) || Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name),
  );

/**
 * Ajustes > Sedes: cocinas de la marca. La carta, el WhatsApp y los pagos siguen siendo uno solo;
 * la sede decide qué cocina prepara cada pedido (domicilios por la zona del barrio, recoger por la
 * sede que elige el cliente). La principal recibe lo que no tiene zona.
 */
export function BranchesSection() {
  const { branches, setBranches, loading, error, base, headers } = useBranches();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // null = sin formulario; 'new' = alta; id = edición
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<BranchForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const shownFeedback = feedback ?? (error ? { type: 'error' as const, text: error } : null);

  const openForm = (branch?: Branch) => {
    setEditing(branch ? branch.id : 'new');
    setForm(
      branch
        ? { name: branch.name, address: branch.address, phone: branch.phone ?? '', isMain: branch.isMain }
        : { ...EMPTY_FORM, isMain: branches.length === 0 },
    );
    setFeedback(null);
  };

  /** Una sede nueva o editada como principal le quita el rol a la anterior (igual que el backend) */
  const applySaved = (saved: Branch) =>
    setBranches((prev) =>
      sortBranches([
        ...prev.filter((b) => b.id !== saved.id).map((b) => (saved.isMain ? { ...b, isMain: false } : b)),
        saved,
      ]),
    );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!base || !editing) return;
    setSaving(true);
    try {
      const isNew = editing === 'new';
      const res = await fetch(isNew ? base : `${base}/${editing}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: headers(),
        body: JSON.stringify({
          name: form.name.trim(),
          address: form.address.trim(),
          phone: form.phone.trim() || null,
          isMain: form.isMain,
        }),
      });
      if (!res.ok) throw new Error(await branchApiError(res, 'No se pudo guardar la sede'));
      const saved: Branch = await res.json();
      applySaved(saved);
      setEditing(null);
      setFeedback({
        type: 'success',
        text: isNew
          ? `${saved.name} quedó creada${saved.isMain ? ' como sede principal' : ''}. Asígnale zonas en la pestaña Domicilios.`
          : 'Sede actualizada.',
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo guardar la sede' });
    } finally {
      setSaving(false);
    }
  };

  const patchBranch = async (branch: Branch, body: Partial<Pick<Branch, 'isActive' | 'isMain'>>, okText: string) => {
    if (!base) return;
    setBusyId(branch.id);
    setFeedback(null);
    try {
      const res = await fetch(`${base}/${branch.id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await branchApiError(res, 'No se pudo actualizar la sede'));
      applySaved(await res.json());
      setFeedback({ type: 'success', text: okText });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo actualizar la sede' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (branch: Branch) => {
    if (
      !base ||
      !window.confirm(
        `¿Eliminar la sede ${branch.name}? Sus zonas, repartidores y cocinas quedan sin sede (pasan a la principal). Los pedidos se conservan.`,
      )
    ) {
      return;
    }
    setBusyId(branch.id);
    setFeedback(null);
    try {
      const res = await fetch(`${base}/${branch.id}`, { method: 'DELETE', headers: headers() });
      if (!res.ok) throw new Error(await branchApiError(res, 'No se pudo eliminar la sede'));
      setBranches((prev) => prev.filter((b) => b.id !== branch.id));
      if (editing === branch.id) setEditing(null);
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo eliminar la sede' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className={settingsCardClass}>
      <SettingsCardHeader
        title="Sedes"
        description="Si tu marca tiene varios locales, créalos aquí. La carta y el WhatsApp siguen siendo uno solo: cada domicilio va a la cocina de la sede que atiende su barrio (según la zona) y quien recoge elige la sede. La sede principal recibe los pedidos de barrios sin zona."
        action={
          editing !== 'new' && (
            <button type="button" onClick={() => openForm()} className={primaryButtonClass}>
              <Plus className="h-4 w-4" /> Agregar sede
            </button>
          )
        }
      />

      <div className="space-y-4 p-6">
        <SettingsFeedback feedback={shownFeedback} />

        {editing && (
          <form onSubmit={handleSave} className="space-y-3 rounded-xl border border-emerald-500/30 bg-slate-950/60 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              {editing === 'new' ? 'Nueva sede' : 'Editar sede'}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr_1fr]">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-400">Nombre</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej. Calle 30"
                  required
                  maxLength={80}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-400">Dirección</span>
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Ej. Calle 30 # 12-45"
                  required
                  maxLength={200}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-400">Teléfono (opcional)</span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="Ej. 300 123 4567"
                  maxLength={30}
                  className={inputClass}
                />
              </label>
            </div>
            <label className="flex items-start gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.isMain}
                onChange={(e) => setForm({ ...form, isMain: e.target.checked })}
                // La principal solo deja de serlo marcando otra
                disabled={editing !== 'new' && branches.find((b) => b.id === editing)?.isMain}
                className="mt-0.5 h-4 w-4 accent-emerald-500"
              />
              <span>
                Sede principal
                <span className="block text-xs text-slate-500">
                  Recibe los domicilios de barrios sin zona (tarifa estándar) y los pedidos para recoger sin sede elegida.
                </span>
              </span>
            </label>
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
          <p className="text-xs text-slate-500">Cargando sedes...</p>
        ) : branches.length === 0 ? (
          !editing && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-700 px-6 py-10 text-center">
              <Building2 className="h-8 w-8 text-slate-600" />
              <p className="text-sm font-semibold text-slate-300">Tu marca funciona como un solo local</p>
              <p className="max-w-sm text-xs text-slate-500">
                Si tienes más de un local, agrega tus sedes: cada una tendrá su propio KDS, sus repartidores y sus zonas de
                domicilio.
              </p>
            </div>
          )
        ) : (
          <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800">
            {branches.map((branch) => (
              <li key={branch.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                    branch.isActive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 text-slate-500'
                  }`}
                >
                  <Building2 className="h-4 w-4" />
                </span>
                <div className={`min-w-0 flex-1 ${branch.isActive ? '' : 'opacity-60'}`}>
                  <p className="flex items-center gap-2 truncate text-sm font-semibold text-white">
                    {branch.name}
                    {branch.isMain && (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                        Principal
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {branch.address}
                    {branch.phone ? ` · ${branch.phone}` : ''}
                  </p>
                </div>
                {!branch.isMain && branch.isActive && (
                  <button
                    type="button"
                    disabled={busyId === branch.id}
                    onClick={() => patchBranch(branch, { isMain: true }, `${branch.name} es ahora la sede principal.`)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-700 px-3 py-1 text-[11px] font-bold text-slate-300 transition hover:border-amber-500/40 hover:text-amber-300 disabled:opacity-60"
                  >
                    <Star className="h-3 w-3" /> Hacer principal
                  </button>
                )}
                {!branch.isMain && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={branch.isActive}
                    aria-label={`${branch.name}: ${branch.isActive ? 'activa' : 'inactiva'}`}
                    disabled={busyId === branch.id}
                    onClick={() =>
                      patchBranch(
                        branch,
                        { isActive: !branch.isActive },
                        branch.isActive ? `${branch.name} dejó de recibir pedidos.` : `${branch.name} vuelve a recibir pedidos.`,
                      )
                    }
                    className={`rounded-full border px-3 py-1 text-[11px] font-bold transition disabled:opacity-60 ${
                      branch.isActive
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : 'border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {branch.isActive ? 'Activa' : 'Inactiva'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openForm(branch)}
                  aria-label={`Editar la sede ${branch.name}`}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(branch)}
                  disabled={busyId === branch.id}
                  aria-label={`Eliminar la sede ${branch.name}`}
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
