'use client';

import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, X } from 'lucide-react';
import type { AdminRestaurant } from './types';

interface NewRestaurantModalProps {
  token: string | null;
  onClose: () => void;
  onCreated: (restaurant: AdminRestaurant) => void;
}

/** "Pizzería Nápoles" -> "pizzeria-napoles" */
function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

const inputClass =
  'w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-violet-500';

export default function NewRestaurantModal({ token, onClose, onCreated }: NewRestaurantModalProps) {
  const [restaurantName, setRestaurantName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cerrar con Escape (salvo mientras se guarda)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const handleNameChange = (value: string) => {
    setRestaurantName(value);
    // El slug sigue al nombre hasta que el usuario lo edite a mano
    if (!slugTouched) setSlug(slugify(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/restaurants', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantName, slug, ownerName, ownerEmail, ownerPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = Array.isArray(data.message) ? data.message.join(' · ') : data.message;
        throw new Error(message || `No se pudo crear el restaurante (${res.status})`);
      }
      onCreated(data as AdminRestaurant);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al crear el restaurante');
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
        aria-labelledby="new-restaurant-title"
        className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 id="new-restaurant-title" className="text-lg font-bold text-white">
            Nuevo Restaurante
          </h2>
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

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          <fieldset className="space-y-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Restaurante</legend>
            <div>
              <label htmlFor="restaurantName" className="mb-1.5 block text-xs font-semibold text-zinc-300">
                Nombre del Restaurante
              </label>
              <input
                id="restaurantName"
                required
                maxLength={100}
                autoFocus
                value={restaurantName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Mi Pizzería"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="slug" className="mb-1.5 block text-xs font-semibold text-zinc-300">
                Slug / Subdominio
              </label>
              <input
                id="slug"
                required
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase());
                }}
                pattern="[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?"
                title="Solo minúsculas, números y guiones (sin guion al inicio/final)"
                placeholder="mi-pizzeria"
                className={`${inputClass} font-mono`}
              />
              <p className="mt-1 text-[11px] text-zinc-500">
                Menú público: <span className="font-mono text-zinc-400">/menu/{slug || 'mi-pizzeria'}</span>
              </p>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Dueño (OWNER)</legend>
            <div>
              <label htmlFor="ownerName" className="mb-1.5 block text-xs font-semibold text-zinc-300">
                Nombre del Dueño
              </label>
              <input
                id="ownerName"
                required
                maxLength={100}
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Ana Gómez"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="ownerEmail" className="mb-1.5 block text-xs font-semibold text-zinc-300">
                Email
              </label>
              <input
                id="ownerEmail"
                type="email"
                required
                autoComplete="off"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="dueno@mipizzeria.com"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="ownerPassword" className="mb-1.5 block text-xs font-semibold text-zinc-300">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="ownerPassword"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 hover:text-zinc-300"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </fieldset>

          {error && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-zinc-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-violet-500 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Creando...' : 'Crear Restaurante'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
