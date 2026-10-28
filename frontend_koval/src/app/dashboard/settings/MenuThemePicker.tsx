'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { MENU_THEMES, type MenuColorMode, type MenuTheme } from '@/lib/menu-themes';

interface MenuThemePickerProps {
  value: MenuTheme;
  onChange: (theme: MenuTheme) => void;
  /** Modo con el que abre la carta: las miniaturas se pintan en ese modo */
  mode: MenuColorMode;
  disabled?: boolean;
}

/**
 * "Tema Visual de la Carta Digital": 4 tarjetas con una miniatura de la carta en los colores reales
 * de cada tema, en el modo elegido (estilos en línea: el modo claro del panel no las altera).
 */
export function MenuThemePicker({ value, onChange, mode, disabled }: MenuThemePickerProps) {
  return (
    <div role="radiogroup" aria-label="Tema visual de la carta digital" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {MENU_THEMES.map((option) => {
        const selected = option.value === value;
        const swatch = option.swatches[mode];
        const radius = option.radius;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`group relative flex flex-col overflow-hidden rounded-xl border text-left transition disabled:opacity-60 ${
              selected
                ? 'border-emerald-500 ring-2 ring-emerald-500/60'
                : 'border-slate-800 hover:border-slate-600'
            }`}
          >
            {/* Miniatura: cabecera, dos platos y el botón principal */}
            <div className="w-full space-y-1.5 p-2.5" style={{ background: swatch.bg }} aria-hidden>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full" style={{ background: swatch.primary }} />
                <span className="h-1.5 w-10 rounded-full" style={{ background: swatch.text, opacity: 0.85 }} />
                <span className="ml-auto h-1.5 w-5 rounded-full" style={{ background: swatch.muted, opacity: 0.6 }} />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[0, 1].map((n) => (
                  <div
                    key={n}
                    className="space-y-1 border p-1.5"
                    style={{ background: swatch.card, borderColor: swatch.border, borderRadius: radius }}
                  >
                    <div className="h-5" style={{ background: swatch.border, borderRadius: `calc(${radius} / 2)` }} />
                    <div className="h-1 w-3/4 rounded-full" style={{ background: swatch.text, opacity: 0.8 }} />
                    <div className="h-1 w-1/2 rounded-full" style={{ background: swatch.muted, opacity: 0.6 }} />
                  </div>
                ))}
              </div>
              <div
                className="flex h-4 items-center justify-center"
                style={{ background: swatch.primary, borderRadius: radius }}
              >
                <span className="h-1 w-8 rounded-full bg-white/90" />
              </div>
            </div>

            <div className="flex w-full flex-1 items-start gap-2 border-t border-slate-800 bg-slate-950 p-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white">{option.label}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-slate-400">{option.description}</p>
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
