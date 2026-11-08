'use client';

import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, X } from 'lucide-react';
import { SudoCancelledError, useSudoMode } from '@/context/SudoContext';
import type { AdminRestaurant, TenantUser } from './types';

interface EditOwnerModalProps {
  token: string | null;
  restaurant: AdminRestaurant & { owner: TenantUser };
  onClose: () => void;
  onSaved: (owner: TenantUser) => void;
}

const inputClass =
  'w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-violet-500';

/**
 * Editar el dueño de un restaurante (PATCH /admin/restaurants/:id/owner): nombre, email y,
 * opcionalmente, una contraseña nueva forzada (cierra sus sesiones). Solo se envía lo que cambió.
 */
export default function EditOwnerModal({ token, restaurant, onClose, onSaved }: EditOwnerModalProps) {
  const { sudoFetch } = useSudoMode();
  const [name, setName] = useState(restaurant.owner.name);
  const [email, setEmail] = useState(restaurant.owner.email);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const changes = {
    ...(name.trim() !== restaurant.owner.name && { name: name.trim() }),
    ...(email.trim().toLowerCase() !== restaurant.owner.email && { email: email.trim().toLowerCase() }),
    ...(password && { password }),
  };
  const hasChanges = Object.keys(changes).length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasChanges) return onClose();
    setSaving(true);
    setError(null);
    try {
      const res = await sudoFetch(`/api/admin/restaurants/${restaurant.id}/owner`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = Array.isArray(data.message) ? data.message.join(' · ') : data.message;
        throw new Error(message || `No se pudo actualizar el dueño (${res.status})`);
      }
      onSaved(data as TenantUser);
    } catch (err: unknown) {
      setError(
        err instanceof SudoCancelledError
          ? 'Cambios sin guardar: confirma tu identidad con el código de 2 pasos.'
          : err instanceof Error
            ? err.message
            : 'Error al actualizar el dueño',
      );
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-owner-title"
        className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="min-w-0">
            <h2 id="edit-owner-title" className="text-lg font-bold text-white">
              Editar dueño
            </h2>
            <p className="truncate text-xs text-zinc-500">{restaurant.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div>
            <label htmlFor="ownerName" className="mb-1.5 block text-xs font-semibold text-zinc-300">
              Nombre del dueño
            </label>
            <input
              id="ownerName"
              required
              maxLength={100}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="ownerEmail" className="mb-1.5 block text-xs font-semibold text-zinc-300">
              Email (inicio de sesión)
            </label>
            <input
              id="ownerEmail"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="ownerPassword" className="mb-1.5 block text-xs font-semibold text-zinc-300">
              Nueva contraseña <span className="font-normal text-zinc-500">(opcional)</span>
            </label>
            <div className="relative">
              <input
                id="ownerPassword"
                type={showPassword ? 'text' : 'password'}
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Déjala vacía para no cambiarla"
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 hover:text-zinc-300"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              {password
                ? 'Se cerrarán sus sesiones abiertas: compártele la nueva contraseña por un canal seguro.'
                : 'Mínimo 8 caracteres. Úsala si el dueño olvidó su contraseña.'}
            </p>
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-zinc-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-zinc-400 hover:text-white disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !hasChanges}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-500 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
