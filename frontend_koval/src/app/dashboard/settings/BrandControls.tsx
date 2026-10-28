'use client';

import React, { useId } from 'react';
import { Check, Palette } from 'lucide-react';
import { storefrontFontVariables } from '@/app/menu/[slug]/fonts';
import {
  ACCENT_PRESETS,
  MENU_FONTS,
  contrastRatio,
  isHexColor,
  type MenuFont,
} from '@/lib/menu-themes';

/**
 * "Color de Acento": el del tema (se adapta solo a claro/oscuro), uno de los sugeridos o uno libre.
 * null = el del tema. Avisa si el color elegido casi no se lee como texto sobre el fondo de la carta.
 */
export function AccentColorPicker({
  value,
  onChange,
  themeAccent,
  background,
  disabled,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
  /** Acento del tema en el modo de apertura (para la muestra "Del tema") */
  themeAccent: string;
  /** Fondo de la carta en el modo de apertura (para avisar del contraste) */
  background: string;
  disabled?: boolean;
}) {
  const inputId = useId();
  const isPreset = ACCENT_PRESETS.some((preset) => preset.value === value);
  const isCustom = isHexColor(value) && !isPreset;
  const lowContrast = isHexColor(value) && contrastRatio(value, background) < 3;

  const swatchClass = (selected: boolean) =>
    `relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 disabled:opacity-60 ${
      selected ? 'border-emerald-500 ring-2 ring-emerald-500/40' : 'border-slate-700 hover:border-slate-500'
    }`;

  return (
    <div>
      <div role="radiogroup" aria-label="Color de acento" className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          disabled={disabled}
          onClick={() => onChange(null)}
          title="Del tema"
          className={`${swatchClass(value === null)} overflow-hidden`}
          style={{ background: `conic-gradient(${themeAccent} 0 50%, #e2e8f0 50% 100%)` }}
        >
          <span className="sr-only">Color del tema</span>
          {value === null && <Check className="h-4 w-4 text-white drop-shadow" strokeWidth={3} />}
        </button>

        {ACCENT_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            role="radio"
            aria-checked={value === preset.value}
            disabled={disabled}
            onClick={() => onChange(preset.value)}
            title={preset.label}
            className={swatchClass(value === preset.value)}
            style={{ background: preset.value }}
          >
            <span className="sr-only">{preset.label}</span>
            {value === preset.value && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
          </button>
        ))}

        {/* Color libre: el círculo abre el selector nativo del sistema */}
        <label
          htmlFor={inputId}
          className={`${swatchClass(isCustom)} cursor-pointer`}
          style={isCustom ? { background: value } : { background: 'conic-gradient(#ef4444, #f59e0b, #22c55e, #06b6d4, #6366f1, #d946ef, #ef4444)' }}
          title="Color personalizado"
        >
          {isCustom ? <Check className="h-4 w-4 text-white drop-shadow" strokeWidth={3} /> : <Palette className="h-4 w-4 text-white drop-shadow" />}
          <input
            id={inputId}
            type="color"
            role="radio"
            aria-checked={isCustom}
            aria-label="Color personalizado"
            value={isHexColor(value) ? value : themeAccent}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value.toLowerCase())}
            className="sr-only"
          />
        </label>
        <span className="text-xs font-medium text-slate-300">
          {value === null ? (
            'Del tema'
          ) : isCustom ? (
            <>
              Color Personalizado · <code className="font-mono text-slate-400">{value.toUpperCase()}</code>
            </>
          ) : (
            <>
              {ACCENT_PRESETS.find((p) => p.value === value)?.label} ·{' '}
              <code className="font-mono text-slate-400">{value?.toUpperCase()}</code>
            </>
          )}
        </span>
      </div>
      <p className={`mt-1.5 text-[11px] ${lowContrast ? 'text-amber-400' : 'text-slate-500'}`}>
        {lowContrast
          ? 'Ojo: este color casi no se lee como texto sobre el fondo de tu carta (precios y enlaces). Prueba uno más intenso.'
          : 'Botones, precios y detalles de la carta. "Del tema" se ajusta solo al modo claro u oscuro.'}
      </p>
    </div>
  );
}

/** "Tipografía de la Carta": selector con vista previa en la fuente real */
export function MenuFontSelect({
  value,
  onChange,
  restaurantName,
  disabled,
}: {
  value: MenuFont;
  onChange: (font: MenuFont) => void;
  restaurantName: string;
  disabled?: boolean;
}) {
  const selectId = useId();
  const current = MENU_FONTS.find((font) => font.value === value) ?? MENU_FONTS[0];
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,16rem)_1fr] md:items-center">
      {/* relative: contiene el label sr-only (position: absolute) */}
      <div className="relative">
        <label htmlFor={selectId} className="sr-only">
          Tipografía de la carta
        </label>
        <select
          id={selectId}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value as MenuFont)}
          className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none transition [color-scheme:dark] focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        >
          {MENU_FONTS.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-slate-500">{current.sample}</p>
      </div>
      {/* Vista previa con las mismas clases que la carta pública */}
      <div
        className={`${storefrontFontVariables} font-${value}${value === 'serif-elegant' ? ' sf-editorial' : ''} rounded-lg border border-slate-800 bg-slate-950 px-4 py-3`}
        aria-hidden
      >
        <p className="font-display text-xl font-black uppercase leading-tight tracking-tight text-white">
          {restaurantName || 'Tu restaurante'}
        </p>
        <p className="mt-0.5 text-sm text-slate-400">Hamburguesa de la casa · $28.000</p>
      </div>
    </div>
  );
}
