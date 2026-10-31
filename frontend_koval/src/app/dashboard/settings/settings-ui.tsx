'use client';

import React from 'react';
import { Bike, Clock, CreditCard, ShieldCheck, Store, type LucideIcon } from 'lucide-react';

/** Pestañas de Ajustes */
export type SettingsTab = 'perfil' | 'horarios' | 'pagos' | 'repartidores' | 'seguridad';

export const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; icon: LucideIcon }> = [
  { id: 'perfil', label: 'Perfil', icon: Store },
  { id: 'horarios', label: 'Horarios', icon: Clock },
  { id: 'pagos', label: 'Pagos', icon: CreditCard },
  { id: 'repartidores', label: 'Repartidores', icon: Bike },
  { id: 'seguridad', label: 'Seguridad', icon: ShieldCheck },
];

export const tabId = (tab: SettingsTab) => `settings-tab-${tab}`;
export const panelId = (tab: SettingsTab) => `settings-panel-${tab}`;

/** Barra de pestañas con subrayado (border-b-2) en la activa; flechas ← → para moverse */
export function SettingsTabs({ active, onChange }: { active: SettingsTab; onChange: (tab: SettingsTab) => void }) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const index = SETTINGS_TABS.findIndex((tab) => tab.id === active);
    const next = SETTINGS_TABS[(index + (e.key === 'ArrowRight' ? 1 : -1) + SETTINGS_TABS.length) % SETTINGS_TABS.length];
    onChange(next.id);
    document.getElementById(tabId(next.id))?.focus();
  };

  return (
    <div className="border-b border-slate-800">
      <div
        role="tablist"
        aria-label="Secciones de ajustes"
        onKeyDown={onKeyDown}
        className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]"
      >
        {SETTINGS_TABS.map(({ id, label, icon: Icon }) => {
          const selected = id === active;
          return (
            <button
              key={id}
              id={tabId(id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId(id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(id)}
              className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm sm:px-4 font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 rounded-t-lg ${
                selected
                  ? 'border-emerald-400 text-white'
                  : 'border-transparent text-slate-400 hover:border-slate-600 hover:text-slate-200'
              }`}
            >
              <Icon className={`hidden h-4 w-4 sm:block ${selected ? 'text-emerald-400' : ''}`} aria-hidden />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Contenedor de cada pestaña (role="tabpanel") */
export function SettingsPanel({ tab, children }: { tab: SettingsTab; children: React.ReactNode }) {
  return (
    <div role="tabpanel" id={panelId(tab)} aria-labelledby={tabId(tab)} tabIndex={-1} className="space-y-6 focus:outline-none">
      {children}
    </div>
  );
}

/** Estilo de tarjeta de Ajustes: borde sutil, sombra suave, cabecera y pie separados (tipo Stripe/Vercel) */
export const settingsCardClass = 'rounded-2xl border border-slate-800 bg-slate-900/60 shadow-sm shadow-black/20';

export function SettingsCardHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 px-6 py-5">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Pie de la tarjeta: nota a la izquierda y la acción principal a la derecha */
export function SettingsCardFooter({ hint, children }: { hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-b-2xl border-t border-slate-800 bg-slate-950/40 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-500">{hint}</p>
      <div className="flex shrink-0 justify-end">{children}</div>
    </div>
  );
}

export const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-emerald-400 disabled:opacity-60 cursor-pointer';

/** Aviso de éxito / error dentro de una tarjeta */
export function SettingsFeedback({ feedback }: { feedback: { type: 'success' | 'error'; text: string } | null }) {
  if (!feedback) return null;
  return (
    <div
      role={feedback.type === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
        feedback.type === 'success'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
      }`}
    >
      {feedback.text}
    </div>
  );
}
