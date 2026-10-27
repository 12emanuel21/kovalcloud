'use client';

import React, { useEffect, useId, useMemo, useState } from 'react';
import { ImageIcon, Link2, Upload, X } from 'lucide-react';

/** Fotos de platos: deben coincidir con el backend (menu-item-image.ts) */
export const DISH_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_DISH_IMAGE_BYTES = 5 * 1024 * 1024;

export type DishImageMode = 'upload' | 'url';

export interface DishImageValue {
  mode: DishImageMode;
  /** "Subir Foto": archivo elegido (se sube a /uploads al guardar el plato) */
  file: File | null;
  /** "Pegar Enlace": URL externa que se guarda tal cual en imageUrl */
  url: string;
}

export const EMPTY_DISH_IMAGE: DishImageValue = { mode: 'upload', file: null, url: '' };

/** ¿Es un enlace externo (no una foto subida a /uploads/menu)? */
export const isExternalImageUrl = (url: string | null | undefined): url is string => /^https?:\/\//i.test(url ?? '');

/** Valor inicial del campo para editar un plato que ya tiene foto */
export function dishImageFrom(imageUrl: string | null | undefined): DishImageValue {
  return isExternalImageUrl(imageUrl) ? { mode: 'url', file: null, url: imageUrl } : EMPTY_DISH_IMAGE;
}

/** Mismas reglas que el backend: JPG/PNG/WebP de hasta 5 MB, o un enlace http(s) */
export function validateDishImage(value: DishImageValue): string | null {
  if (value.mode === 'upload') {
    if (!value.file) return null;
    if (!DISH_IMAGE_TYPES.includes(value.file.type)) return 'Formato no válido: sube una imagen JPG, PNG o WebP.';
    if (value.file.size > MAX_DISH_IMAGE_BYTES) return 'La imagen no puede superar 5 MB.';
    return null;
  }
  const url = value.url.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
  } catch {
    return 'El enlace de la imagen debe empezar por http:// o https://';
  }
  return url.length > 2048 ? 'El enlace de la imagen es demasiado largo.' : null;
}

interface DishImageFieldProps {
  value: DishImageValue;
  onChange: (value: DishImageValue) => void;
  /** Foto guardada del plato (al editar), para la vista previa */
  currentImageUrl?: string | null;
  disabled?: boolean;
}

/** Foto del plato: "Subir Foto" (archivo local) o "Pegar Enlace (URL)" */
export function DishImageField({ value, onChange, currentImageUrl, disabled }: DishImageFieldProps) {
  const inputId = useId();
  const [brokenPreview, setBrokenPreview] = useState<string | null>(null);

  // Vista previa del archivo elegido (se libera al cambiarlo o desmontar)
  const filePreview = useMemo(() => (value.file ? URL.createObjectURL(value.file) : null), [value.file]);
  useEffect(() => () => {
    if (filePreview) URL.revokeObjectURL(filePreview);
  }, [filePreview]);

  const preview =
    value.mode === 'upload'
      ? filePreview ?? (currentImageUrl || null)
      : !validateDishImage(value) && value.url.trim()
        ? value.url.trim()
        : null;
  const error = validateDishImage(value);

  const tabClass = (active: boolean) =>
    `flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
      active ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
    }`;

  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium text-slate-300">Foto del Plato (Opcional)</span>

      <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1" role="tablist" aria-label="Origen de la foto">
        <button
          type="button"
          role="tab"
          aria-selected={value.mode === 'upload'}
          onClick={() => onChange({ ...value, mode: 'upload' })}
          disabled={disabled}
          className={tabClass(value.mode === 'upload')}
        >
          <Upload className="h-3.5 w-3.5" aria-hidden /> Subir Foto
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value.mode === 'url'}
          onClick={() => onChange({ ...value, mode: 'url' })}
          disabled={disabled}
          className={tabClass(value.mode === 'url')}
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden /> Pegar Enlace (URL)
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-slate-600">
          {preview && brokenPreview !== preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- vista previa local o de un dominio arbitrario
            <img src={preview} alt="" className="h-full w-full object-cover" onError={() => setBrokenPreview(preview)} />
          ) : (
            <ImageIcon className="h-5 w-5" aria-hidden />
          )}
        </div>

        {value.mode === 'upload' ? (
          <div className="min-w-0 flex-1">
            <label
              htmlFor={inputId}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 ${disabled ? 'pointer-events-none opacity-50' : ''}`}
            >
              <Upload className="h-3.5 w-3.5" aria-hidden />
              {value.file ? 'Cambiar archivo' : currentImageUrl ? 'Reemplazar foto' : 'Elegir archivo'}
            </label>
            <input
              id={inputId}
              type="file"
              accept={DISH_IMAGE_TYPES.join(',')}
              capture="environment"
              disabled={disabled}
              onChange={(e) => {
                onChange({ ...value, file: e.target.files?.[0] ?? null });
                e.target.value = '';
              }}
              className="sr-only"
            />
            <p className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-slate-500">
              {value.file ? (
                <>
                  <span className="truncate">{value.file.name}</span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...value, file: null })}
                    aria-label="Quitar archivo elegido"
                    className="shrink-0 rounded p-0.5 hover:bg-slate-800 hover:text-slate-300"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </>
              ) : (
                'JPG, PNG o WebP · máx. 5 MB'
              )}
            </p>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <input
              type="url"
              inputMode="url"
              value={value.url}
              onChange={(e) => onChange({ ...value, url: e.target.value })}
              placeholder="https://ejemplo.com/foto-del-plato.jpg"
              disabled={disabled}
              aria-label="Enlace de la imagen"
              aria-invalid={Boolean(error)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              {currentImageUrl && !isExternalImageUrl(currentImageUrl)
                ? 'Se guarda el enlace tal cual. Vacío = se conserva la foto subida.'
                : 'Se guarda el enlace tal cual. Vacío = sin foto.'}
            </p>
          </div>
        )}
      </div>

      {error && <p className="text-[11px] text-rose-400">{error}</p>}
    </div>
  );
}
