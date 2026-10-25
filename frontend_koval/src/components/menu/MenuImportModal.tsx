'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Sparkles,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const API_URL = typeof window !== 'undefined' ? '/api' : 'http://koval_backend:4000';

const SPREADSHEET_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
const ACCEPTED_FILES = '.pdf,application/pdf,.xlsx,.xls,.csv';
/** Plantilla Excel estática (public/plantilla-menu.xlsx) */
const TEMPLATE_XLSX_URL = '/plantilla-menu.xlsx';
const TEMPLATE_COLUMNS = ['Categoría', 'Nombre', 'Descripción', 'Precio', 'Disponible', 'URL Imagen'];

/** Prompt para ChatGPT / Claude: convierte un Excel desordenado al formato de la plantilla */
const AI_FORMAT_PROMPT =
  'Actúa como un experto en estructuración de datos. Te voy a pasar el Excel de mi menú actual. Necesito que extraigas todos los platos y me devuelvas un nuevo archivo Excel estructurado EXACTAMENTE con estas 6 columnas (respetando los nombres en la primera fila): "Categoría", "Nombre", "Descripción", "Precio", "Disponible", "URL Imagen". Asegúrate de que el Precio sea solo un número (sin símbolos de moneda) y Disponible diga SI o NO. Si no hay descripción o imagen, deja la celda vacía.';

interface ImportedItem {
  name: string;
  description?: string | null;
  price: number;
}

/** Respuesta del PDF con IA */
interface PdfImportResult {
  kind: 'pdf';
  message: string;
  categoriesCount: number;
  categories: { name: string; items: ImportedItem[] }[];
}

/** Respuesta de la carga masiva Excel/CSV */
interface SpreadsheetImportResult {
  kind: 'spreadsheet';
  message: string;
  itemsCreated: number;
  categoriesCreated: number;
  warnings: string[];
}

type ImportResult = PdfImportResult | SpreadsheetImportResult;

/** Error de validación: el backend devuelve message = [resumen, "Fila N: ...", ...] */
interface ImportError {
  title: string;
  rows: string[];
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

const isSpreadsheet = (file: File) => SPREADSHEET_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
const isPdf = (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

/** Plantilla CSV mínima (UTF-8 con BOM para que Excel respete las tildes) */
function downloadCsvTemplate() {
  const lines = [
    TEMPLATE_COLUMNS.join(','),
    'Pizzas,Margarita,"Salsa de tomate, mozzarella y albahaca fresca",25000,SI,https://ejemplo.com/margarita.jpg',
    'Bebidas,Limonada de coco,"Natural, 16 oz",8000,SI,',
  ];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'plantilla-menu.csv';
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Importación de menú en dos modos, según el archivo:
 * - PDF: digitalización con IA (lenta).
 * - Excel/CSV: carga masiva por columnas, todo o nada, con errores por fila.
 */
export default function MenuImportModal({ open, onClose, onImported }: MenuImportModalProps) {
  const { restaurantId, token } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<ImportError | null>(null);

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

  const mode: 'pdf' | 'spreadsheet' | null = file ? (isSpreadsheet(file) ? 'spreadsheet' : isPdf(file) ? 'pdf' : null) : null;

  const selectFile = (selected: File | null) => {
    setError(null);
    if (selected && !isSpreadsheet(selected) && !isPdf(selected)) {
      setFile(null);
      setError({ title: 'Formato no soportado: sube un PDF, un Excel (.xlsx/.xls) o un CSV.', rows: [] });
      return;
    }
    setFile(selected);
  };

  const handleUpload = async () => {
    if (!file || !restaurantId || !mode) return;
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
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // 400 de la carga masiva: [resumen, "Fila 3: ...", "Fila 40: ..."]
        if (Array.isArray(data.message)) {
          const messages = data.message.map(String);
          const rows = messages.filter((m: string) => /^Fila \d+/.test(m) || m.startsWith('…'));
          const others = messages.filter((m: string) => !rows.includes(m));
          setError({ title: others.join(' ') || 'El archivo tiene errores', rows });
        } else {
          setError({
            title:
              data.message || (mode === 'pdf' ? 'Error al procesar el PDF' : 'Error al importar el archivo'),
            rows: [],
          });
        }
        return;
      }

      setResult(mode === 'pdf' ? { kind: 'pdf', ...data } : { kind: 'spreadsheet', warnings: [], ...data });
      onImported?.();
    } catch {
      setError({ title: 'No se pudo conectar con el servidor. Intenta de nuevo.', rows: [] });
    } finally {
      setLoading(false);
    }
  };

  const totalPdfItems = result?.kind === 'pdf' ? result.categories.reduce((acc, c) => acc + c.items.length, 0) : 0;

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
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h2 id="menu-import-title" className="text-base font-semibold text-white">
                Importar menú
              </h2>
              <p className="text-xs text-slate-400">
                Sube tu carta en PDF (la IA la digitaliza) o un Excel/CSV con tus platos.
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
              {/* Plantilla */}
              <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-300">
                  ¿Prefieres importar tu menú sin IA? Descarga la plantilla de Excel, llénala y súbela aquí.
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={TEMPLATE_XLSX_URL}
                    download="plantilla-menu.xlsx"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Plantilla .xlsx
                  </a>
                  <button
                    type="button"
                    onClick={downloadCsvTemplate}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
                  >
                    .csv
                  </button>
                </div>
              </div>

              <AiFormatHelp />

              {/* Zona de subida */}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={loading}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/50 px-6 py-10 text-center transition hover:border-emerald-500/50 hover:bg-slate-900 disabled:opacity-60"
              >
                {file ? (
                  <>
                    {mode === 'spreadsheet' ? (
                      <FileSpreadsheet className="h-8 w-8 text-emerald-400" />
                    ) : (
                      <FileText className="h-8 w-8 text-emerald-400" />
                    )}
                    <span className="text-sm font-medium text-slate-200">{file.name}</span>
                    <span className="text-xs text-slate-500">
                      {(file.size / 1024 / 1024).toFixed(1)} MB · haz clic para cambiarlo
                    </span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-8 w-8 text-slate-500" />
                    <span className="text-sm font-medium text-slate-300">Selecciona el archivo de tu menú</span>
                    <span className="text-xs text-slate-500">PDF, Excel (.xlsx, .xls) o CSV · máx. 10 MB</span>
                  </>
                )}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_FILES}
                className="hidden"
                onChange={(e) => {
                  selectFile(e.target.files?.[0] ?? null);
                  e.target.value = ''; // permite volver a elegir el mismo archivo tras corregirlo
                }}
              />

              {/* Aviso según el modo */}
              {mode === 'pdf' && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-300">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    La importación por IA puede tomar hasta 2 minutos. Revisa los precios al terminar. El PDF también
                    se guardará para enviarlo por WhatsApp.
                  </span>
                </div>
              )}
              {mode === 'spreadsheet' && (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300">
                  <Zap className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    La carga masiva es casi instantánea. Si alguna fila tiene errores no se importa nada y te
                    mostramos exactamente qué corregir.
                  </span>
                </div>
              )}

              <p className="text-xs text-slate-500">
                Los platos importados se <span className="text-slate-300">añaden</span> a tu menú actual; no se
                reemplaza nada. Las categorías con el mismo nombre se reutilizan.
              </p>

              {/* Errores (por fila en la carga masiva) */}
              {error && (
                <div role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
                  <p className="flex items-start gap-2 font-semibold">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error.title}</span>
                  </p>
                  {error.rows.length > 0 && (
                    <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto border-t border-rose-500/20 pt-2 text-xs text-rose-200">
                      {error.rows.map((row) => (
                        <li key={row} className="flex gap-2">
                          <span aria-hidden>•</span>
                          <span>{row}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}

          {/* Resultado: PDF con IA (detalle de lo creado) */}
          {result?.kind === 'pdf' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  {result.message}: {result.categoriesCount} categorías y {totalPdfItems} platos.
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

          {/* Resultado: carga masiva */}
          {result?.kind === 'spreadsheet' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-400">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{result.message}.</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                  <p className="text-2xl font-bold text-white">{result.itemsCreated}</p>
                  <p className="text-xs text-slate-400">platos creados</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                  <p className="text-2xl font-bold text-white">{result.categoriesCreated}</p>
                  <p className="text-xs text-slate-400">categorías nuevas</p>
                </div>
              </div>
              {result.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
                  <p className="font-semibold">Importado con avisos:</p>
                  <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto text-xs text-amber-200">
                    {result.warnings.map((warning) => (
                      <li key={warning}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              )}
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
                disabled={!file || !mode || loading}
                className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {mode === 'pdf' ? 'Procesando con IA…' : 'Importando…'}
                  </>
                ) : mode === 'spreadsheet' ? (
                  <>
                    <Zap className="h-4 w-4" />
                    Importar platos
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

/**
 * Ayuda discreta (acordeón): prompt listo para copiar en ChatGPT o Claude y convertir un Excel
 * desordenado al formato de la plantilla. No compite con la acción principal (subir el archivo).
 */
function AiFormatHelp() {
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_FORMAT_PROMPT);
    } catch {
      // Sin Clipboard API (p. ej. contexto no seguro): copia seleccionando el texto
      textareaRef.current?.select();
      if (!document.execCommand('copy')) return;
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <details className="group rounded-xl border border-slate-800 bg-slate-900/30">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-medium text-slate-400 transition hover:text-slate-200 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
          ¿Tu menú está en otro formato? Usa IA gratis para arreglarlo
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" aria-hidden />
      </summary>

      <div className="space-y-3 border-t border-slate-800 px-4 py-3">
        <p className="text-xs text-slate-400">
          Copia este texto, pégalo en ChatGPT o Claude junto con tu Excel actual y sube aquí el archivo que te devuelva.
        </p>
        <textarea
          ref={textareaRef}
          readOnly
          value={AI_FORMAT_PROMPT}
          rows={6}
          aria-label="Prompt para formatear el menú con IA"
          onFocus={(e) => e.currentTarget.select()}
          className="w-full resize-none rounded-lg border border-slate-800 bg-slate-950/60 p-3 font-mono text-[11px] leading-relaxed text-slate-300 outline-none focus:border-slate-600"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={copyPrompt}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              copied
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            <span aria-live="polite">{copied ? '¡Copiado!' : 'Copiar al portapapeles'}</span>
          </button>
        </div>
      </div>
    </details>
  );
}
