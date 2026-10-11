'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileText, Loader2, Sparkles, UploadCloud, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const API_URL = typeof window !== 'undefined' ? '/api' : 'http://koval_backend:4000';

interface ImportedItem {
  name: string;
  description?: string | null;
  price: number;
}

interface ImportResult {
  message: string;
  categoriesCount: number;
  categories: { name: string; items: ImportedItem[] }[];
}

interface MenuImportModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Se llama tras una importación exitosa (para recargar el menú).
   * Renderízalo condicionalmente ({open && <MenuImportModal/>}) para que su estado se reinicie al cerrar.
   */
  onImported?: () => void;
}

/** Digitaliza un menú en PDF con IA y crea sus categorías y platos */
export default function MenuImportModal({ open, onClose, onImported }: MenuImportModalProps) {
  const { restaurantId, token } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cerrar con Escape (salvo mientras procesa)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onClose]);

  if (!open) return null;

  const handleUpload = async () => {
    if (!file || !restaurantId) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const currentToken = token || localStorage.getItem('koval_token');
      const res = await fetch(`${API_URL}/restaurants/${restaurantId}/menu/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentToken}` },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Error al procesar el PDF');
      }
      const data: ImportResult = await res.json();
      setResult(data);
      onImported?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al procesar el PDF');
    } finally {
      setLoading(false);
    }
  };

  const totalItems = result?.categories.reduce((acc, c) => acc + c.items.length, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={() => !loading && onClose()}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-import-title"
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-2xl"
      >
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 id="menu-import-title" className="text-base font-semibold text-white">
                Importar menú con IA
              </h2>
              <p className="text-xs text-slate-400">
                Sube tu carta en PDF y la IA creará las categorías y los platos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {!result && (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={loading}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/50 px-6 py-10 text-center transition hover:border-emerald-500/50 hover:bg-slate-900 disabled:opacity-60"
              >
                {file ? (
                  <>
                    <FileText className="h-8 w-8 text-emerald-400" />
                    <span className="text-sm font-medium text-slate-200">{file.name}</span>
                    <span className="text-xs text-slate-500">
                      {(file.size / 1024 / 1024).toFixed(1)} MB · haz clic para cambiarlo
                    </span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-8 w-8 text-slate-500" />
                    <span className="text-sm font-medium text-slate-300">Selecciona el PDF de tu menú</span>
                    <span className="text-xs text-slate-500">Solo archivos .pdf</span>
                  </>
                )}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />

              <p className="text-xs text-slate-500">
                Los platos importados se <span className="text-slate-300">añaden</span> a tu menú actual; no se
                reemplaza nada. El PDF también se guardará para enviarlo por WhatsApp.
              </p>

              {error && (
                <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
                  {error}
                </p>
              )}
            </>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  {result.message}: {result.categoriesCount} categorías y {totalItems} platos.
                </span>
              </div>
              {result.categories.map((cat, i) => (
                <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/50">
                  <h3 className="border-b border-slate-800 px-4 py-2.5 text-sm font-semibold text-white">
                    {cat.name}
                  </h3>
                  <ul className="divide-y divide-slate-800/70">
                    {cat.items.map((item, j) => (
                      <li key={j} className="flex items-start justify-between gap-4 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm text-slate-200">{item.name}</p>
                          {item.description && (
                            <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-emerald-400">
                          ${item.price.toLocaleString('es-CO')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pie */}
        <div className="flex justify-end gap-2 border-t border-slate-800 p-4">
          {result ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Listo
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={!file || loading}
                className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Procesando con IA…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Digitalizar menú
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
