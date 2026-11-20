'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

/** Montos por defecto si el local no los ha configurado (igual que el backend) */
export const DEFAULT_DELIVERY_FEE_PRESETS = [0, 3000, 4000, 5000, 6000, 8000];

/** "Gratis" o "$5.000" */
export const formatDeliveryFee = (fee: number) => (fee === 0 ? 'Gratis' : `$${fee.toLocaleString('es-CO')}`);

export interface DeliveryFeeBranch {
  id: string;
  name: string;
  isMain: boolean;
}

interface DeliveryFeeActionsProps {
  presets: number[];
  /** Sedes activas: con más de una, se puede asignar o cambiar la sede antes de mandar a cocina */
  branches: DeliveryFeeBranch[];
  currentBranchId?: string | null;
  busy?: boolean;
  onSubmit: (deliveryFee: number, branchId?: string) => void;
  /** Al corregir un valor ya definido: botón para cerrar sin cambiar */
  onCancel?: () => void;
}

const MAX_FEE = 1_000_000;

/**
 * Botones rápidos del domicilio en la tarjeta del Kanban (misma forma que los de minutos de
 * preparación): un toque define el valor, se avisa al cliente por WhatsApp y el pedido sigue en
 * Pendientes hasta que la cocina pulse "Iniciar preparación".
 */
export default function DeliveryFeeActions({ presets, branches, currentBranchId, busy = false, onSubmit, onCancel }: DeliveryFeeActionsProps) {
  const [showOther, setShowOther] = useState(false);
  const [other, setOther] = useState('');
  const [branchId, setBranchId] = useState(currentBranchId ?? branches.find((b) => b.isMain)?.id ?? '');
  const multiBranch = branches.length > 1;

  // Solo se envía la sede si el operador la cambió
  const submit = (fee: number) => onSubmit(fee, multiBranch && branchId && branchId !== currentBranchId ? branchId : undefined);

  const otherValue = Number(other.replace(/\D/g, ''));
  const otherValid = other.trim() !== '' && Number.isInteger(otherValue) && otherValue >= 0 && otherValue <= MAX_FEE;

  return (
    <div className="space-y-2" role="group" aria-label="Valor del domicilio">
      {multiBranch && (
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <span className="shrink-0 font-semibold">Sede</span>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            disabled={busy}
            className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-white outline-none focus:border-emerald-500"
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
                {branch.isMain ? ' (principal)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {presets.map((fee) => (
          <button
            key={fee}
            type="button"
            disabled={busy}
            onClick={() => submit(fee)}
            title={fee === 0 ? 'Domicilio gratis' : `Domicilio de ${formatDeliveryFee(fee)}`}
            className="min-h-11 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50 cursor-pointer active:scale-98"
          >
            {formatDeliveryFee(fee)}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowOther((v) => !v)}
          aria-expanded={showOther}
          className="min-h-11 rounded-lg border border-slate-600 text-sm font-bold text-slate-200 transition hover:border-slate-400 disabled:opacity-50 cursor-pointer"
        >
          Otro
        </button>
      </div>

      {showOther && (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (otherValid) submit(otherValue);
          }}
        >
          <label className="relative flex-1">
            <span className="sr-only">Otro valor de domicilio</span>
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">$</span>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={other}
              onChange={(e) => setOther(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="Ej. 7.000"
              className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 pl-7 pr-3 text-sm text-white outline-none focus:border-emerald-500"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !otherValid}
            className="min-h-11 shrink-0 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            Enviar
          </button>
        </form>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500" aria-live="polite">
          {busy ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Enviando al cliente...
            </span>
          ) : (
            'Le enviamos el total y los medios de pago por WhatsApp.'
          )}
        </p>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 px-2 text-xs font-semibold text-slate-400 hover:text-slate-200">
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
