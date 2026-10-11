'use client';

import React from 'react';
import { ChefHat, Loader2 } from 'lucide-react';

/** Tiempos estimados que la cocina puede comunicar al cliente al iniciar la preparación */
export const ESTIMATED_MINUTES_OPTIONS = [15, 30, 45, 60] as const;

interface PrepareActionsProps {
  /** Inicia la preparación; con minutos, el backend avisa al cliente el tiempo estimado */
  onPrepare: (estimatedMinutes?: number) => void;
  /** Rechaza el pedido (ya confirmado por el usuario) */
  onReject: () => void;
  busy?: boolean;
  /** 'lg' para la pantalla de cocina (KDS), 'sm' para el Kanban del dashboard */
  size?: 'sm' | 'lg';
}

/**
 * Botonera de 1 clic para pedidos pendientes: cada botón dispara la acción inmediatamente.
 * Compartida por el Kanban (/dashboard/orders) y la pantalla de cocina (/kitchen).
 */
export default function PrepareActions({ onPrepare, onReject, busy = false, size = 'sm' }: PrepareActionsProps) {
  const lg = size === 'lg';

  const handleReject = () => {
    if (window.confirm('¿Seguro que deseas cancelar este pedido?')) onReject();
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-1.5">
        {ESTIMATED_MINUTES_OPTIONS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            disabled={busy}
            onClick={() => onPrepare(minutes)}
            title={`Iniciar preparación y avisar al cliente: listo en ~${minutes} min`}
            className={`rounded-lg border border-blue-500/30 bg-blue-500/10 font-bold text-blue-300 transition hover:bg-blue-500/20 disabled:opacity-50 cursor-pointer active:scale-98 ${
              lg ? 'py-2.5 text-sm' : 'py-1.5 text-[11px]'
            }`}
          >
            {minutes} min
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => onPrepare()}
        className={`w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 font-bold text-white shadow-md shadow-blue-900/40 transition hover:bg-blue-500 disabled:opacity-50 cursor-pointer active:scale-98 ${
          lg ? 'py-3 text-base' : 'py-2.5 text-xs'
        }`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChefHat className="h-4 w-4" />}
        {busy ? 'Actualizando...' : 'Iniciar Preparación'}
      </button>

      <div className="flex justify-center">
        <button
          type="button"
          disabled={busy}
          onClick={handleReject}
          className={`rounded px-2 py-0.5 font-semibold text-rose-400/80 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50 cursor-pointer ${
            lg ? 'text-xs' : 'text-[10px]'
          }`}
        >
          Rechazar Pedido
        </button>
      </div>
    </div>
  );
}
