'use client';

import React, { useId, useRef, useState } from 'react';
import { ImagePlus, Link2, Loader2, Trash2 } from 'lucide-react';

const API_URL = '/api';
const MAX_BANNER_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const message = Array.isArray(data.message) ? data.message.join('. ') : data.message;
  return message || fallback;
}

/**
 * "Imagen de Portada": la foto grande del hero de la carta pública (bannerUrl).
 * Subir un archivo la aplica al instante (POST /restaurants/:id/banner, igual que las fotos de platos);
 * pegar un enlace o quitarla se guarda con "Guardar identidad" (PATCH /restaurants/:id).
 */
export function BannerField({
  restaurantId,
  token,
  value,
  onChange,
  onUploaded,
  disabled,
}: {
  restaurantId: string | null;
  token: string | null;
  value: string;
  onChange: (url: string) => void;
  /** La portada subida ya quedó guardada (aviso al dueño) */
  onUploaded: () => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrl, setShowUrl] = useState(false);
  // Enlace que no carga (mal copiado, imagen borrada): se avisa en lugar de mostrar el ícono roto
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const url = value.trim();
  const busy = disabled || uploading;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !restaurantId) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Formato no válido: sube una imagen JPG, PNG o WebP.');
      return;
    }
    if (file.size > MAX_BANNER_BYTES) {
      setError('La imagen no puede superar 5 MB.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch(`${API_URL}/restaurants/${encodeURIComponent(restaurantId)}/banner`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        throw new Error(res.status === 413 ? 'La imagen no puede superar 5 MB.' : await apiErrorMessage(res, 'No se pudo subir la portada'));
      }
      const data: { bannerUrl: string } = await res.json();
      onChange(data.bannerUrl);
      setShowUrl(false);
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la portada');
    } finally {
      setUploading(false);
    }
  };

  const secondaryButton =
    'inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white disabled:opacity-50 cursor-pointer';

  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-slate-300">Imagen de Portada</span>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* Vista previa con la proporción del hero (escritorio) */}
        <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 sm:w-56">
          {url && brokenUrl !== url ? (
            // eslint-disable-next-line @next/next/no-img-element -- portada en dominio arbitrario o subida al servidor
            <img src={url} alt="Portada actual de la carta" className="h-full w-full object-cover" onError={() => setBrokenUrl(url)} />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-3 text-center text-[11px] text-slate-500">
              <ImagePlus className="h-6 w-6 text-slate-600" />
              {url ? 'No se pudo cargar la imagen de este enlace' : 'Sin portada: la carta muestra tu logo o inicial'}
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy || !restaurantId}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60 cursor-pointer"
            >
              <ImagePlus className="h-4 w-4" />
              {uploading ? 'Subiendo...' : url ? 'Cambiar imagen de portada' : 'Subir imagen de portada'}
            </button>
            <button type="button" onClick={() => setShowUrl((v) => !v)} disabled={busy} aria-expanded={showUrl} className={secondaryButton}>
              <Link2 className="h-4 w-4" /> Usar un enlace
            </button>
            {url && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setError(null);
                }}
                disabled={busy}
                className={`${secondaryButton} hover:border-rose-500/50 hover:text-rose-300`}
              >
                <Trash2 className="h-4 w-4" /> Quitar
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept={ACCEPTED_TYPES.join(',')} onChange={handleFile} className="hidden" tabIndex={-1} aria-hidden />

          {showUrl && (
            <div>
              <label htmlFor={inputId} className="mb-1 block text-[11px] font-semibold text-slate-400">
                Enlace de la imagen
              </label>
              <input
                id={inputId}
                type="url"
                inputMode="url"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="https://ejemplo.com/portada.jpg"
                disabled={busy}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
              {error}
            </p>
          )}
          <p className="text-[11px] text-slate-500">
            Foto grande junto al nombre en tu carta. Horizontal, mínimo 1200 px de ancho; JPG, PNG o WebP de hasta 5 MB.
            La foto subida se aplica al instante; un enlace o quitarla, al guardar.
          </p>
        </div>
      </div>
    </div>
  );
}
