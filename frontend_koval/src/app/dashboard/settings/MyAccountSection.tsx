'use client';

import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { SettingsCardHeader, SettingsFeedback, primaryButtonClass, settingsCardClass } from './settings-ui';

const API_URL = '/api';

const inputClass =
  'w-full rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';

/**
 * Ajustes > Seguridad > "Mi cuenta": el usuario cambia su propia contraseña (PATCH /users/me/password).
 * El backend cierra las demás sesiones y devuelve un token nuevo para seguir conectado aquí.
 * En Modo Dios no se muestra: cambiaría la contraseña del SUPERADMIN, no la del dueño.
 */
export function MyAccountSection() {
  const { user, token, isImpersonating, refreshSession } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (isImpersonating) {
    return (
      <section className={settingsCardClass}>
        <SettingsCardHeader
          title="Mi cuenta"
          description="Estás operando este local en Modo Dios. Para cambiar el nombre, email o contraseña del dueño usa «Editar» en el panel SuperAdmin."
        />
      </section>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      setFeedback({ type: 'error', text: 'La nueva contraseña y su confirmación no coinciden.' });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`${API_URL}/users/me/password`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = Array.isArray(data.message) ? data.message.join('. ') : data.message;
        throw new Error(message || 'No se pudo cambiar la contraseña');
      }
      refreshSession(data.accessToken);
      setCurrent('');
      setNext('');
      setConfirm('');
      setFeedback({ type: 'success', text: 'Contraseña actualizada. Cerramos tus sesiones en otros dispositivos.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo cambiar la contraseña' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={settingsCardClass}>
      <SettingsCardHeader
        title="Mi cuenta"
        description={`Cambia la contraseña con la que entras${user?.email ? ` (${user.email})` : ''}. Tus sesiones en otros dispositivos se cerrarán.`}
      />
      <form onSubmit={handleSubmit} className="space-y-4 p-6">
        <SettingsFeedback feedback={feedback} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-300">Contraseña actual</span>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              maxLength={72}
              autoComplete="current-password"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-300">Nueva contraseña</span>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-300">Repite la nueva contraseña</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              className={inputClass}
            />
          </label>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className={primaryButtonClass}>
            <KeyRound className="h-4 w-4" />
            {saving ? 'Guardando...' : 'Cambiar mi contraseña'}
          </button>
        </div>
      </form>
    </section>
  );
}
