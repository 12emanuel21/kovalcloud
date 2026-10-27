'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { RESTAURANT_TIMEZONE } from '@/lib/business-hours';

const API_URL = '/api';

/** "AAAA-MM-DD" en la zona horaria del local (Colombia) */
const localDate = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: RESTAURANT_TIMEZONE });

/** Suma días a una fecha "AAAA-MM-DD" sin depender de la zona del navegador */
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function presetRanges(): Array<{ label: string; from: string; to: string }> {
  const today = localDate(new Date());
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = addDays(monthStart, -1);
  return [
    { label: 'Hoy', from: today, to: today },
    { label: 'Últimos 7 días', from: addDays(today, -6), to: today },
    { label: 'Este mes', from: monthStart, to: today },
    { label: 'Mes anterior', from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd },
  ];
}

/**
 * "Exportar a Excel (.xlsx)": reporte contable de pedidos por rango de fechas (GET /orders/export/excel).
 * Solo OWNER y SUPERADMIN: la cocina no ve datos financieros (el backend también lo exige).
 */
export function ExportOrdersButton() {
  const { user, restaurantId, token } = useAuth();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(() => presetRanges()[2].from);
  const [to, setTo] = useState(() => presetRanges()[2].to);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cerrar con clic fuera o Escape
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (user?.role !== 'OWNER' && user?.role !== 'SUPERADMIN') return null;

  const download = async () => {
    if (!restaurantId) return;
    if (from > to) {
      setError('La fecha inicial no puede ser posterior a la final.');
      return;
    }
    setDownloading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ restaurantId, from, to });
      const res = await fetch(`${API_URL}/orders/export/excel?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.message === 'string' ? data.message : 'No se pudo generar el reporte');
      }
      const filename =
        /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `pedidos-${from}_${to}.xlsx`;
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el reporte');
    } finally {
      setDownloading(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-2 text-xs text-white outline-none transition [color-scheme:dark] focus:border-emerald-500';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
      >
        <FileSpreadsheet className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">📥 Exportar a Excel (.xlsx)</span>
        <span className="sm:hidden">Excel</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Exportar pedidos a Excel"
          className="absolute right-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-2xl shadow-black/40"
        >
          <div>
            <p className="text-sm font-semibold text-white">Reporte contable de pedidos</p>
            <p className="text-[11px] text-slate-400">Pedidos + resumen por estado y medio de pago (hora de Colombia).</p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {presetRanges().map((preset) => {
              const active = preset.from === from && preset.to === to;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setFrom(preset.from);
                    setTo(preset.to);
                  }}
                  aria-pressed={active}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                    active
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                      : 'border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="block text-[11px] font-medium text-slate-400">Desde</span>
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
            </label>
            <label className="space-y-1">
              <span className="block text-[11px] font-medium text-slate-400">Hasta</span>
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputClass} />
            </label>
          </div>

          {error && <p className="text-[11px] text-rose-400">{error}</p>}

          <button
            type="button"
            onClick={download}
            disabled={downloading || !from || !to}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {downloading ? 'Generando...' : 'Descargar .xlsx'}
          </button>
        </div>
      )}
    </div>
  );
}
