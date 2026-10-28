'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { MENU_LAYOUTS, type MenuLayout, type ThemeSwatch } from '@/lib/menu-themes';

interface MenuLayoutPickerProps {
  value: MenuLayout;
  onChange: (layout: MenuLayout) => void;
  /** Colores del tema y modo elegidos: la miniatura muestra la carta tal como se verá */
  swatch: ThemeSwatch;
  radius: string;
  disabled?: boolean;
}

/** "Estructura del Menú": cuadrícula de tarjetas grandes, lista compacta estilo delivery o bistró tradicional */
export function MenuLayoutPicker({ value, onChange, swatch, radius, disabled }: MenuLayoutPickerProps) {
  return (
    <div role="radiogroup" aria-label="Estructura del menú" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {MENU_LAYOUTS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`flex w-full flex-col overflow-hidden rounded-xl border text-left transition disabled:opacity-60 ${
              selected ? 'border-emerald-500 ring-2 ring-emerald-500/60' : 'border-slate-800 hover:border-slate-600'
            }`}
          >
            <div className="h-36 w-full overflow-hidden p-2.5" style={{ background: swatch.bg }} aria-hidden>
              {option.value === 'visual-grid' ? (
                <GridPreview swatch={swatch} radius={radius} />
              ) : option.value === 'compact-row' ? (
                <RowsPreview swatch={swatch} radius={radius} />
              ) : (
                <BistroPreview swatch={swatch} />
              )}
            </div>
            <div className="flex w-full flex-1 items-start gap-2 border-t border-slate-800 bg-slate-950 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white">{option.label}</p>
                <p className="mt-1 text-[11px] leading-snug text-slate-400">{option.description}</p>
              </div>
              {selected && (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function GridPreview({ swatch, radius }: { swatch: ThemeSwatch; radius: string }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <div key={n} className="overflow-hidden border" style={{ background: swatch.card, borderColor: swatch.border, borderRadius: radius }}>
          <div className="h-6" style={{ background: swatch.border }} />
          <div className="space-y-1 p-1">
            <div className="h-1 w-3/4 rounded-full" style={{ background: swatch.text, opacity: 0.8 }} />
            <div className="h-1.5 w-full" style={{ background: swatch.primary, borderRadius: `calc(${radius} / 2)` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RowsPreview({ swatch, radius }: { swatch: ThemeSwatch; radius: string }) {
  return (
    <div>
      <div className="mb-1.5 flex gap-1">
        {[0, 1, 2].map((n) => (
          <span
            key={n}
            className="h-2.5 w-7 rounded-full border"
            style={n === 0 ? { background: swatch.primary, borderColor: swatch.primary } : { background: swatch.card, borderColor: swatch.border }}
          />
        ))}
      </div>
      {[0, 1, 2, 3].map((n) => (
        <div key={n} className="flex items-center gap-1.5 border-b py-1" style={{ borderColor: swatch.border }}>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="h-1 w-3/4 rounded-full" style={{ background: swatch.text, opacity: 0.85 }} />
            <div className="h-1 w-1/2 rounded-full" style={{ background: swatch.muted, opacity: 0.6 }} />
            <div className="h-1 w-1/4 rounded-full" style={{ background: swatch.primary }} />
          </div>
          <div className="h-5 w-5 shrink-0" style={{ background: swatch.border, borderRadius: `calc(${radius} / 2)` }} />
        </div>
      ))}
    </div>
  );
}

function BistroPreview({ swatch }: { swatch: ThemeSwatch }) {
  return (
    <div className="px-1">
      <div className="flex items-center gap-1.5">
        <span className="h-px flex-1" style={{ background: swatch.border }} />
        <span className="text-[8px] leading-none" style={{ color: swatch.primary }}>✦</span>
        <span className="h-px flex-1" style={{ background: swatch.border }} />
      </div>
      <div className="mx-auto mt-1 mb-2 h-1.5 w-12 rounded-full" style={{ background: swatch.text, opacity: 0.85 }} />
      {[0, 1, 2, 3].map((n) => (
        <div key={n} className="mb-2 flex items-start gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-end gap-1">
              <div className="h-1 w-8 shrink-0 rounded-full" style={{ background: swatch.text, opacity: 0.85 }} />
              <div className="mb-px flex-1 border-b border-dotted" style={{ borderColor: swatch.muted }} />
              <div className="h-1 w-4 shrink-0 rounded-full" style={{ background: swatch.primary }} />
            </div>
            <div className="mt-1 h-1 w-3/5 rounded-full" style={{ background: swatch.muted, opacity: 0.55 }} />
          </div>
          {n % 2 === 0 && <div className="h-4 w-4 shrink-0 rounded-sm border" style={{ background: swatch.border, borderColor: swatch.border }} />}
        </div>
      ))}
    </div>
  );
}
