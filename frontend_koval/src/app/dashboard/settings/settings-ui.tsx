'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bike,
  Bot,
  Building2,
  ChefHat,
  Clock,
  CreditCard,
  MapPin,
  MessageCircle,
  Palette,
  ShieldCheck,
  Store,
  type LucideIcon,
} from 'lucide-react';

/** Secciones de Ajustes; cada una tiene su URL (/dashboard/settings?tab=...) */
export type SettingsTab =
  | 'local'
  | 'horarios'
  | 'whatsapp'
  | 'domicilio'
  | 'sedes'
  | 'repartidores'
  | 'equipo'
  | 'apariencia'
  | 'asistente'
  | 'pagos'
  | 'seguridad';

interface SettingsTabDef {
  id: SettingsTab;
  label: string;
  icon: LucideIcon;
}

/**
 * Tres grupos: lo mínimo para abrir hoy, el día a día con el equipo y lo que se toca una vez.
 * El orden de cada grupo es el de la navegación.
 */
export const SETTINGS_GROUPS: Array<{ label: string; hint: string; tabs: SettingsTabDef[] }> = [
  {
    label: 'Esencial',
    hint: 'Lo mínimo para abrir hoy',
    tabs: [
      { id: 'local', label: 'Datos del local', icon: Store },
      { id: 'horarios', label: 'Horarios y cierre', icon: Clock },
      { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
      { id: 'domicilio', label: 'Domicilio', icon: MapPin },
    ],
  },
  {
    label: 'Operación',
    hint: 'Tu equipo y tus locales',
    tabs: [
      { id: 'repartidores', label: 'Repartidores', icon: Bike },
      { id: 'equipo', label: 'Equipo de cocina', icon: ChefHat },
      { id: 'sedes', label: 'Sedes', icon: Building2 },
    ],
  },
  {
    label: 'Avanzado',
    hint: 'Se configura una vez',
    tabs: [
      { id: 'apariencia', label: 'Apariencia de la carta', icon: Palette },
      { id: 'asistente', label: 'Instrucciones del asistente', icon: Bot },
      { id: 'pagos', label: 'Pagos en línea (Wompi)', icon: CreditCard },
      { id: 'seguridad', label: 'Seguridad y cuenta', icon: ShieldCheck },
    ],
  },
];

const ALL_TABS = SETTINGS_GROUPS.flatMap((group) => group.tabs);

export const DEFAULT_SETTINGS_TAB: SettingsTab = 'local';

/** Nombres anteriores de las pestañas (enlaces guardados o compartidos siguen funcionando) */
const LEGACY_TABS: Record<string, SettingsTab> = { perfil: 'local', domicilios: 'domicilio' };

/** ?tab= de la URL -> sección válida (desconocida o vacía: Datos del local) */
export function parseSettingsTab(value: string | null | undefined): SettingsTab {
  if (!value) return DEFAULT_SETTINGS_TAB;
  if (value in LEGACY_TABS) return LEGACY_TABS[value];
  return ALL_TABS.some((tab) => tab.id === value) ? (value as SettingsTab) : DEFAULT_SETTINGS_TAB;
}

export const settingsTabHref = (tab: SettingsTab) => `/dashboard/settings?tab=${tab}`;

export const settingsTabLabel = (tab: SettingsTab) => ALL_TABS.find((t) => t.id === tab)?.label ?? 'Ajustes';

/**
 * Navegación de Ajustes: columna lateral agrupada en escritorio y un selector compacto en móvil
 * (11 secciones en pestañas horizontales no caben en un teléfono). Cada sección es un enlace real:
 * se puede compartir, abrir en otra pestaña y volver con el botón Atrás.
 */
export function SettingsNav({ active }: { active: SettingsTab }) {
  const router = useRouter();

  return (
    <>
      <label className="block md:hidden">
        <span className="sr-only">Sección de ajustes</span>
        <select
          value={active}
          onChange={(e) => router.push(settingsTabHref(e.target.value as SettingsTab), { scroll: false })}
          className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-3 text-sm font-semibold text-white outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        >
          {SETTINGS_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <nav aria-label="Secciones de ajustes" className="hidden space-y-6 md:block">
        {SETTINGS_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">{group.label}</p>
            <p className="px-3 pb-2 text-[11px] text-slate-600">{group.hint}</p>
            <ul className="space-y-0.5">
              {group.tabs.map(({ id, label, icon: Icon }) => {
                const selected = id === active;
                return (
                  <li key={id}>
                    <Link
                      href={settingsTabHref(id)}
                      scroll={false}
                      aria-current={selected ? 'page' : undefined}
                      className={`flex min-h-10 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${
                        selected
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${selected ? 'text-emerald-400' : ''}`} aria-hidden />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
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

/** Campo de texto de las tarjetas de Ajustes */
export const settingsInputClass =
  'w-full rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60';

export const settingsLabelClass = 'mb-1.5 block text-xs font-semibold text-slate-300';

/** Nota bajo un campo */
export const settingsHintClass = 'mt-1 text-xs text-slate-500';

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
