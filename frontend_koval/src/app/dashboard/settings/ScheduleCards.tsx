'use client';

import React, { useState } from 'react';
import { SHIFT_CHANGED_EVENT } from '@/components/orders/ShiftExtensionPanel';
import { WEEK_DAYS, type WeekDay } from '@/lib/business-hours';
import {
  SettingsCardFooter,
  SettingsCardHeader,
  SettingsFeedback,
  primaryButtonClass,
  settingsCardClass,
  settingsInputClass,
  settingsLabelClass,
} from './settings-ui';
import {
  DAY_PILLS,
  blocksToHours,
  createBlock,
  describeDays,
  hoursToBlocks,
  uncoveredDays,
  validateBlocks,
  type ScheduleBlock,
} from './schedule-blocks';
import { useConfigPatch, type RestaurantSettings } from './useRestaurantSettings';

type Feedback = { type: 'success' | 'error'; text: string } | null;

interface CardProps {
  restaurant: RestaurantSettings;
  onSaved: (saved: Partial<RestaurantSettings>) => void;
}

/** Avisa al panel "Turno / Horario" (Ajustes y Pedidos) que relea el estado del local */
const notifyShiftChanged = () => window.dispatchEvent(new Event(SHIFT_CHANGED_EVENT));

/**
 * Cierre de emergencia: el interruptor se aplica al instante (es la forma rápida de dejar de recibir
 * pedidos). El mensaje que ven los clientes se guarda aparte.
 */
export function EmergencyCloseCard({ restaurant, onSaved }: CardProps) {
  const patchConfig = useConfigPatch();
  const [closed, setClosed] = useState(Boolean(restaurant.isTemporarilyClosed));
  const [message, setMessage] = useState(restaurant.closedMessage ?? '');
  const [savedMessage, setSavedMessage] = useState(restaurant.closedMessage ?? '');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const save = async (next: { isTemporarilyClosed?: boolean; closedMessage?: string }) => {
    setBusy(true);
    setFeedback(null);
    try {
      const saved = await patchConfig(next, 'No se pudo actualizar el cierre de emergencia');
      const isClosed = Boolean(saved.isTemporarilyClosed);
      setClosed(isClosed);
      setMessage(saved.closedMessage ?? '');
      setSavedMessage(saved.closedMessage ?? '');
      onSaved({ isTemporarilyClosed: isClosed, closedMessage: saved.closedMessage ?? null });
      notifyShiftChanged();
      setFeedback({
        type: 'success',
        text:
          next.isTemporarilyClosed === undefined
            ? 'Mensaje de cierre guardado.'
            : isClosed
              ? 'Local cerrado: la carta y el bot dejan de recibir pedidos.'
              : 'Local abierto de nuevo según tu horario.',
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo actualizar el cierre de emergencia' });
    } finally {
      setBusy(false);
    }
  };

  const toggle = () => {
    const next = !closed;
    if (next && !window.confirm('¿Cerrar el local ahora? La carta y el bot dejarán de recibir pedidos hasta que lo vuelvas a abrir.')) {
      return;
    }
    void save({ isTemporarilyClosed: next, closedMessage: message.trim() });
  };

  return (
    <section className={`${settingsCardClass} ${closed ? 'border-rose-500/40' : ''}`}>
      <SettingsCardHeader
        title="Cierre de emergencia"
        description="Cierra el local al instante, sin importar el horario. Se aplica en cuanto lo activas."
        action={
          <button
            type="button"
            role="switch"
            aria-checked={closed}
            aria-label="Cierre de emergencia"
            disabled={busy}
            onClick={toggle}
            className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border transition disabled:opacity-60 ${
              closed ? 'border-rose-500 bg-rose-600' : 'border-slate-600 bg-slate-700'
            }`}
          >
            <span
              className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${closed ? 'translate-x-7' : 'translate-x-1'}`}
            />
          </button>
        }
      />
      <div className="space-y-3 p-6">
        <SettingsFeedback feedback={feedback} />
        <p className={`text-sm font-semibold ${closed ? 'text-rose-300' : 'text-emerald-300'}`} aria-live="polite">
          {closed ? 'Cerrado por emergencia: no se reciben pedidos.' : 'Recibiendo pedidos según tu horario.'}
        </p>
        <label className="block">
          <span className={settingsLabelClass}>Mensaje para tus clientes</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ej. Hoy cerramos por mantenimiento, volvemos mañana a las 11:00"
              maxLength={300}
              disabled={busy}
              className={settingsInputClass}
            />
            <button
              type="button"
              disabled={busy || message.trim() === savedMessage.trim()}
              onClick={() => save({ closedMessage: message.trim() })}
              className="shrink-0 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-emerald-500/40 hover:text-white disabled:opacity-50"
            >
              Guardar mensaje
            </button>
          </div>
        </label>
      </div>
    </section>
  );
}

/** Horarios de atención: bloques tipo alarma (franja + días). Guarda solo businessHours. */
export function BusinessHoursCard({ restaurant, onSaved }: CardProps) {
  const patchConfig = useConfigPatch();
  const [blocks, setBlocks] = useState<ScheduleBlock[]>(() => hoursToBlocks(restaurant.businessHours));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const updateBlock = (id: string, patch: Partial<Omit<ScheduleBlock, 'id'>>) =>
    setBlocks((prev) => prev.map((block) => (block.id === id ? { ...block, ...patch } : block)));

  const toggleDay = (id: string, day: WeekDay) =>
    setBlocks((prev) =>
      prev.map((block) => {
        if (block.id !== id) return block;
        const selected = block.days.includes(day);
        // Se conserva el orden L→D para que el resumen y el JSON sean estables
        const days = WEEK_DAYS.filter((d) => (d === day ? !selected : block.days.includes(d)));
        return { ...block, days };
      }),
    );

  // El nuevo bloque preselecciona los días que aún no tienen horario (ej. tras L–V, propone S y D)
  const addBlock = () => setBlocks((prev) => [...prev, createBlock({ days: prev.length ? uncoveredDays(prev) : undefined })]);
  const removeBlock = (id: string) => setBlocks((prev) => prev.filter((block) => block.id !== id));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const hoursError = validateBlocks(blocks);
    if (hoursError) {
      setFeedback({ type: 'error', text: hoursError });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await patchConfig({ businessHours: blocksToHours(blocks) }, 'No se pudieron guardar los horarios');
      onSaved({ businessHours: saved.businessHours ?? null });
      notifyShiftChanged();
      setFeedback({ type: 'success', text: 'Horarios guardados. La carta y el bot ya los usan.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudieron guardar los horarios' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className={settingsCardClass}>
      <SettingsCardHeader
        title="Horarios de atención"
        description="Un bloque por cada franja; marca los días en que aplica. Para turnos partidos o fines de semana distintos, agrega otro bloque."
      />
      <div className="space-y-3 p-6">
        <SettingsFeedback feedback={feedback} />

        {blocks.length === 0 ? (
          <div className="space-y-1 rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-5 text-center">
            <p className="text-sm font-semibold text-slate-300">Sin horario configurado</p>
            <p className="text-xs text-slate-500">La carta y el bot consideran el local abierto siempre (salvo el cierre de emergencia).</p>
          </div>
        ) : (
          blocks.map((block, index) => {
            const overnight = Boolean(block.open && block.close && block.close < block.open);
            return (
              <div key={block.id} className="space-y-4 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Horario {index + 1}</p>
                    <p className="truncate text-xs text-slate-400">
                      {describeDays(block.days)} · {block.open || '--:--'} – {block.close || '--:--'}
                      {overnight && ' (cierra al día siguiente)'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeBlock(block.id)}
                    aria-label={`Eliminar horario ${index + 1}`}
                    className="min-h-10 shrink-0 cursor-pointer rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20"
                  >
                    Eliminar
                  </button>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <label className="space-y-1">
                    <span className="block text-xs font-semibold text-slate-400">Abre</span>
                    <input
                      type="time"
                      value={block.open}
                      onChange={(e) => updateBlock(block.id, { open: e.target.value })}
                      required
                      className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-sm text-white outline-none [color-scheme:dark] focus:border-emerald-500"
                    />
                  </label>
                  <span className="pb-2 text-slate-600">→</span>
                  <label className="space-y-1">
                    <span className="block text-xs font-semibold text-slate-400">Cierra</span>
                    <input
                      type="time"
                      value={block.close}
                      onChange={(e) => updateBlock(block.id, { close: e.target.value })}
                      required
                      className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-sm text-white outline-none [color-scheme:dark] focus:border-emerald-500"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-2" role="group" aria-label={`Días del horario ${index + 1}`}>
                  {WEEK_DAYS.map((day) => {
                    const selected = block.days.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(block.id, day)}
                        aria-pressed={selected}
                        title={DAY_PILLS[day].label}
                        className={`h-10 w-10 cursor-pointer rounded-full border text-xs font-bold transition ${
                          selected
                            ? 'border-emerald-400 bg-emerald-500 text-slate-950'
                            : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                        }`}
                      >
                        {DAY_PILLS[day].short}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        <button
          type="button"
          onClick={addBlock}
          className="min-h-11 w-full cursor-pointer rounded-2xl border border-dashed border-emerald-500/40 text-sm font-bold text-emerald-400 transition hover:border-emerald-400 hover:bg-emerald-500/5"
        >
          {blocks.length === 0 ? '+ Agregar horario' : '+ Agregar otro horario'}
        </button>
      </div>
      <SettingsCardFooter hint="Fuera de horario la carta y el bot no reciben pedidos.">
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? 'Guardando...' : 'Guardar horarios'}
        </button>
      </SettingsCardFooter>
    </form>
  );
}
