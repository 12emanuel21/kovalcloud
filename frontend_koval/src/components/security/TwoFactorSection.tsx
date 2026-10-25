'use client';

import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { TwoFactorSetup } from './TwoFactorSetup';

const API_URL = '/api';

/**
 * Seguridad de la cuenta: estado y activación del 2FA (Google Authenticator).
 * Con el 2FA activo, los cambios sensibles piden un código (Sudo Mode de 30 minutos).
 */
export function TwoFactorSection() {
  const { token } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);

  // Estado real desde el backend (el usuario guardado en el navegador puede estar desactualizado)
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`${API_URL}/auth/profile`, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? (res.json() as Promise<{ isTwoFactorEnabled?: boolean }>) : null))
      .then((profile) => {
        if (!cancelled && profile) setEnabled(Boolean(profile.isTwoFactorEnabled));
      })
      .catch(() => {
        // Sin estado: se muestra la opción de activar; el backend rechaza si ya estaba activo
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <section className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl backdrop-blur-sm md:p-8">
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Seguridad (Autenticación en 2 Pasos)</h2>
          <p className="text-xs text-slate-400">
            Protege pagos, WhatsApp y datos del local: al guardarlos se pide un código de Google Authenticator.
          </p>
        </div>
      </div>

      {enabled === null ? (
        <p className="text-xs text-slate-500">Consultando estado...</p>
      ) : enabled ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-emerald-300">
            <span className="text-lg font-bold">✓</span>
            <span className="text-xs font-bold uppercase tracking-wider">Autenticación en 2 pasos activa</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Al guardar configuraciones sensibles te pediremos un código; después quedas en modo seguro 30 minutos.
          </p>
        </div>
      ) : (
        <TwoFactorSetup onEnabled={() => setEnabled(true)} />
      )}
    </section>
  );
}
