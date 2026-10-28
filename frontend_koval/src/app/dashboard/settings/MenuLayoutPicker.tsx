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

/** "Estructura del Menú": cuadrícula de tarjetas grandes o lista compacta estilo delivery */
export function MenuLayoutPicker({ value, onChange, swatch, radius, disabled }: MenuLayoutPickerProps) {
  return (
    <div role="radiogroup" aria-label="Estructura del menú" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            className={`flex w-full items-stretch overflow-hidden rounded-xl border text-left transition disabled:opacity-60 ${
              selected ? 'border-emerald-500 ring-2 ring-emerald-500/60' : 'border-slate-800 hover:border-slate-600'
            }`}
          >
            <div className="w-32 shrink-0 p-2.5" style={{ background: swatch.bg }} aria-hidden>
              {option.value === 'visual-grid' ? <GridPreview swatch={swatch} radius={radius} /> : <RowsPreview swatch={swatch} radius={radius} />}
            </div>
            <div className="flex min-w-0 flex-1 items-start gap-2 border-l border-slate-800 bg-slate-950 p-3">
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
    <div className="grid grid-cols-2 gap-1.5">
      {[0, 1, 2, 3].map((n) => (
        <div key={n} className="overflow-hidden border" style={{ background: swatch.card, borderColor: swatch.border, borderRadius: radius }}>
          <div className="h-7" style={{ background: swatch.border }} />
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
