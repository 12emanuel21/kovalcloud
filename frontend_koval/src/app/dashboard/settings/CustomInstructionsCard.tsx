'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { SettingsCardHeader, SettingsFeedback, primaryButtonClass, settingsCardClass } from './settings-ui';

const API_URL = typeof window !== 'undefined' ? '/api' : 'http://koval_backend:4000';

/** Igual que el backend (VARCHAR(800)) */
const MAX_LENGTH = 800;

async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const message = Array.isArray(data.message) ? data.message.join('. ') : data.message;
  return message || fallback;
}

/**
 * Ajustes > Perfil: reglas del negocio en lenguaje normal ("no enviamos jugos naturales a
 * domicilio..."). El asistente de WhatsApp las tiene en cuenta al atender y al revisar los pedidos
 * de la carta. Se guarda aparte del formulario del perfil (PATCH /restaurants/:id).
 */
export function CustomInstructionsCard() {
  const { token, restaurantId } = useAuth();
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const url = restaurantId ? `${API_URL}/restaurants/${encodeURIComponent(restaurantId)}` : null;

  useEffect(() => {
    if (!url || !token) return;
    let cancelled = false;
    fetch(url, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudieron cargar las instrucciones'));
        return res.json() as Promise<{ customInstructions?: string | null }>;
      })
      .then((data) => {
        if (cancelled) return;
        const text = data.customInstructions ?? '';
        setValue(text);
        setSaved(text);
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

  const length = value.length;
  const unchanged = value.trim() === saved.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    if (value.trim().length > MAX_LENGTH) {
      setFeedback({ type: 'error', text: `Máximo ${MAX_LENGTH} caracteres.` });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ customInstructions: value.trim() || null }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudieron guardar las instrucciones'));
      const data: { customInstructions?: string | null } = await res.json();
      const stored = data.customInstructions ?? '';
      setValue(stored);
      setSaved(stored);
      setFeedback({
        type: 'success',
        text: stored
          ? 'Instrucciones guardadas. Se aplican desde el próximo mensaje de tus clientes.'
          : 'Instrucciones borradas.',
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudieron guardar las instrucciones' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={settingsCardClass}>
      <SettingsCardHeader
        title="Instrucciones especiales para tus pedidos"
        description="Escribe reglas o excepciones de tu negocio. El asistente automático las tendrá en cuenta al atender a tus clientes."
      />
      <form onSubmit={handleSubmit} className="space-y-3 p-6">
        <SettingsFeedback feedback={feedback} />
        <label className="block">
          <span className="sr-only">Instrucciones especiales para tus pedidos</span>
          <textarea
            rows={4}
            maxLength={MAX_LENGTH}
            value={value}
            disabled={loading}
            onChange={(e) => {
              setValue(e.target.value);
              setFeedback(null);
            }}
            placeholder="Ej: No enviamos jugos naturales a domicilio para evitar derrames, ofrecer gaseosa en su lugar. Después de las 9:00 p. m. no recibimos billetes de $100.000."
            className="w-full resize-y rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm leading-relaxed text-white outline-none transition placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60"
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={`text-xs ${length >= MAX_LENGTH ? 'text-amber-400' : 'text-slate-500'}`} aria-live="polite">
            {length} / {MAX_LENGTH}
          </p>
          <button type="submit" disabled={saving || loading || unchanged} className={primaryButtonClass}>
            {saving ? 'Guardando...' : 'Guardar instrucciones'}
          </button>
        </div>
        <p className="text-[11px] text-slate-500">
          Los precios, el valor del domicilio y los datos de pago siempre salen de tu configuración: estas instrucciones no los
          cambian.
        </p>
      </form>
    </section>
  );
}
