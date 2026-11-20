'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import {
  SettingsCardFooter,
  SettingsCardHeader,
  SettingsFeedback,
  primaryButtonClass,
  settingsCardClass,
  settingsHintClass,
  settingsLabelClass,
} from './settings-ui';
import { useRestaurantPatch, type RestaurantSettings } from './useRestaurantSettings';
import { DEFAULT_DELIVERY_FEE_PRESETS, formatDeliveryFee } from '@/components/orders/DeliveryFeeActions';

type Feedback = { type: 'success' | 'error'; text: string } | null;

interface CardProps {
  restaurant: RestaurantSettings;
  onSaved: (saved: Partial<RestaurantSettings>) => void;
}

const MAX_PRESETS = 10;
const MAX_FEE = 1_000_000;

/** "7.000" o "7000" -> 7000; vacío o inválido -> null */
const parseFee = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  const fee = Number(digits);
  return Number.isInteger(fee) && fee <= MAX_FEE ? fee : null;
};

const sameList = (a: number[], b: number[]) => a.length === b.length && a.every((value, i) => value === b[i]);

/**
 * Ajustes › Domicilio: los montos de los botones rápidos que aparecen en cada domicilio del tablero.
 * El local toca uno según la dirección, la hora o el clima y el cliente recibe el valor por WhatsApp.
 */
export function DeliveryFeePresetsCard({ restaurant, onSaved }: CardProps) {
  const patchRestaurant = useRestaurantPatch();
  const initial = restaurant.deliveryFeePresets?.length ? restaurant.deliveryFeePresets : DEFAULT_DELIVERY_FEE_PRESETS;
  const [presets, setPresets] = useState<number[]>(initial);
  const [savedPresets, setSavedPresets] = useState<number[]>(initial);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const draftFee = parseFee(draft);
  const canAdd = draftFee !== null && !presets.includes(draftFee) && presets.length < MAX_PRESETS;

  const add = () => {
    if (draftFee === null) return;
    if (presets.includes(draftFee)) {
      setFeedback({ type: 'error', text: `${formatDeliveryFee(draftFee)} ya está en la lista.` });
      return;
    }
    if (presets.length >= MAX_PRESETS) {
      setFeedback({ type: 'error', text: `Máximo ${MAX_PRESETS} montos.` });
      return;
    }
    setPresets((prev) => [...prev, draftFee].sort((a, b) => a - b));
    setDraft('');
    setFeedback(null);
  };

  const save = async () => {
    if (presets.length === 0) {
      setFeedback({ type: 'error', text: 'Deja al menos un monto (o restablece los de siempre).' });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await patchRestaurant({ deliveryFeePresets: presets }, 'No se pudieron guardar los montos');
      const stored = Array.isArray(saved.deliveryFeePresets) ? saved.deliveryFeePresets : presets;
      setPresets(stored);
      setSavedPresets(stored);
      onSaved({ deliveryFeePresets: stored });
      setFeedback({ type: 'success', text: 'Montos guardados: ya aparecen en los pedidos del tablero.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudieron guardar los montos' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={settingsCardClass}>
      <SettingsCardHeader
        title="Botones rápidos de domicilio"
        description="Los valores que aparecen en cada domicilio del tablero. Tocas uno según la dirección, la hora o el clima, y el cliente recibe el total por WhatsApp."
      />
      <div className="space-y-5 p-6">
        <SettingsFeedback feedback={feedback} />

        <ul className="flex flex-wrap gap-2" aria-label="Montos de domicilio">
          {presets.map((fee) => (
            <li
              key={fee}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 pl-3 text-sm font-bold text-emerald-300"
            >
              {formatDeliveryFee(fee)}
              <button
                type="button"
                onClick={() => {
                  setPresets((prev) => prev.filter((value) => value !== fee));
                  setFeedback(null);
                }}
                aria-label={`Quitar ${formatDeliveryFee(fee)}`}
                className="flex h-11 w-9 items-center justify-center rounded-r-lg text-emerald-300/70 transition hover:bg-emerald-500/20 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
          {presets.length === 0 && <li className="text-sm text-slate-500">Sin montos: agrega al menos uno.</li>}
        </ul>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <label className="block sm:w-56">
            <span className={settingsLabelClass}>Agregar monto</span>
            <span className="relative block">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={draft}
                onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="Ej. 7.000 (0 = Gratis)"
                className="min-h-11 w-full rounded-lg border border-slate-800 bg-slate-950 pl-7 pr-3 text-sm text-white outline-none transition placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </span>
          </label>
          <button
            type="submit"
            disabled={!canAdd}
            className="min-h-11 rounded-lg border border-slate-700 px-4 text-sm font-semibold text-slate-200 transition hover:border-emerald-500/40 hover:text-white disabled:opacity-50"
          >
            Agregar
          </button>
        </form>
        <p className={settingsHintClass}>
          Máximo {MAX_PRESETS} montos. En el tablero también hay un botón &quot;Otro&quot; para escribir cualquier valor.
        </p>
      </div>
      <SettingsCardFooter
        hint={
          <button
            type="button"
            onClick={() => {
              setPresets(DEFAULT_DELIVERY_FEE_PRESETS);
              setFeedback(null);
            }}
            className="text-xs font-semibold text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
          >
            Restablecer los de siempre
          </button>
        }
      >
        <button type="button" onClick={save} disabled={saving || sameList(presets, savedPresets)} className={primaryButtonClass}>
          {saving ? 'Guardando...' : 'Guardar montos'}
        </button>
      </SettingsCardFooter>
    </section>
  );
}

/**
 * Tarifa fija única (opcional): para locales que cobran siempre lo mismo. Cada domicilio la suma solo
 * (carta y WhatsApp), sin confirmarlo en el tablero. Apagada: el local define cada domicilio a mano.
 */
export function FlatDeliveryFeeCard({ restaurant, onSaved }: CardProps) {
  const patchRestaurant = useRestaurantPatch();
  const stored = typeof restaurant.flatDeliveryFee === 'number' ? restaurant.flatDeliveryFee : null;
  const [enabled, setEnabled] = useState(stored !== null);
  const [amount, setAmount] = useState(stored !== null ? String(stored) : '');
  const [saved, setSaved] = useState<number | null>(stored);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const fee = parseFee(amount);
  const next = enabled ? fee : null;
  const unchanged = next === saved;

  const save = async () => {
    if (enabled && fee === null) {
      setFeedback({ type: 'error', text: 'Escribe el valor de la tarifa fija (0 = domicilio siempre gratis).' });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const response = await patchRestaurant({ flatDeliveryFee: next }, 'No se pudo guardar la tarifa fija');
      const value = typeof response.flatDeliveryFee === 'number' ? response.flatDeliveryFee : null;
      setSaved(value);
      onSaved({ flatDeliveryFee: value });
      setFeedback({
        type: 'success',
        text:
          value === null
            ? 'Tarifa fija apagada: defines cada domicilio desde el tablero.'
            : `Tarifa fija de ${formatDeliveryFee(value)}: se suma sola a cada domicilio.`,
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo guardar la tarifa fija' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={settingsCardClass}>
      <SettingsCardHeader
        title="Tarifa fija única (opcional)"
        description="Si siempre cobras lo mismo por el domicilio, actívala: cada pedido la suma solo, sin confirmarla en el tablero."
        action={
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Tarifa fija única"
            onClick={() => {
              setEnabled((v) => !v);
              setFeedback(null);
            }}
            className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border transition ${
              enabled ? 'border-emerald-400 bg-emerald-500' : 'border-slate-600 bg-slate-700'
            }`}
          >
            <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        }
      />
      <div className="space-y-3 p-6">
        <SettingsFeedback feedback={feedback} />
        {enabled ? (
          <label className="block sm:w-56">
            <span className={settingsLabelClass}>Valor del domicilio</span>
            <span className="relative block">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value.replace(/[^\d.]/g, ''));
                  setFeedback(null);
                }}
                placeholder="Ej. 5.000"
                className="min-h-11 w-full rounded-lg border border-slate-800 bg-slate-950 pl-7 pr-3 text-sm text-white outline-none transition placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </span>
            <span className={`block ${settingsHintClass}`}>0 = domicilio siempre gratis.</span>
          </label>
        ) : (
          <p className="text-sm text-slate-400">
            Apagada: en cada domicilio eliges el valor con los botones rápidos y se lo enviamos al cliente por WhatsApp.
          </p>
        )}
      </div>
      <SettingsCardFooter>
        <button type="button" onClick={save} disabled={saving || unchanged} className={primaryButtonClass}>
          {saving ? 'Guardando...' : 'Guardar tarifa'}
        </button>
      </SettingsCardFooter>
    </section>
  );
}
