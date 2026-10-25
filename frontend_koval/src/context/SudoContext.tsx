'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Loader2, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { OtpInput, TwoFactorSetup } from '@/components/security/TwoFactorSetup';
import { SUDO_HEADER, clearSudoToken, readSudoToken, saveSudoToken } from '@/lib/sudo-token';

const API_URL = '/api';

/** El usuario cerró el modal de código: la operación sensible no se envía */
export class SudoCancelledError extends Error {
  constructor() {
    super('Cambios no guardados: confirma tu identidad con el código de 2 pasos para continuar.');
    this.name = 'SudoCancelledError';
  }
}

interface SudoContextValue {
  /**
   * fetch para operaciones que pueden exigir Sudo Mode: adjunta x-sudo-token si hay uno vigente y,
   * solo si el backend responde 403 SUDO_REQUIRED, abre el modal de código y reintenta la petición original.
   * Cualquier otra respuesta se devuelve tal cual (el backend decide qué cambios son sensibles).
   * Rechaza con SudoCancelledError si el usuario cancela.
   */
  sudoFetch: (input: string, init?: RequestInit) => Promise<Response>;
}

const SudoContext = createContext<SudoContextValue | undefined>(undefined);

export function useSudoMode(): SudoContextValue {
  const context = useContext(SudoContext);
  if (!context) throw new Error('useSudoMode debe usarse dentro de <SudoProvider>');
  return context;
}

export function SudoProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState<{ needsSetup: boolean } | null>(null);
  const pendingRef = useRef<{ resolve: (token: string) => void; reject: (error: Error) => void } | null>(null);
  // Varias peticiones a la vez comparten un solo modal
  const inflightRef = useRef<Promise<string> | null>(null);

  const requestSudo = useCallback((needsSetup: boolean) => {
    if (inflightRef.current) return inflightRef.current;
    const promise = new Promise<string>((resolve, reject) => {
      pendingRef.current = { resolve, reject };
      setPrompt({ needsSetup });
    }).finally(() => {
      inflightRef.current = null;
      pendingRef.current = null;
      setPrompt(null);
    });
    inflightRef.current = promise;
    return promise;
  }, []);

  const sudoFetch = useCallback(
    async (input: string, init: RequestInit = {}) => {
      const send = (sudoToken: string | null) => {
        const headers = new Headers(init.headers);
        if (sudoToken) headers.set(SUDO_HEADER, sudoToken);
        return fetch(input, { ...init, headers });
      };

      const response = await send(readSudoToken(user?.id));
      if (response.status !== 403) return response;
      const data = await response
        .clone()
        .json()
        .catch(() => ({}));
      if (data?.message !== 'SUDO_REQUIRED') return response;

      clearSudoToken();
      const sudoToken = await requestSudo(data.reason === 'TWO_FACTOR_NOT_ENABLED');
      return send(sudoToken);
    },
    [user?.id, requestSudo],
  );

  return (
    <SudoContext.Provider value={{ sudoFetch }}>
      {children}
      {prompt && (
        <SudoModal
          needsSetup={prompt.needsSetup}
          onSuccess={(sudoToken, expiresAt) => {
            if (user) saveSudoToken(sudoToken, expiresAt, user.id);
            pendingRef.current?.resolve(sudoToken);
          }}
          onCancel={() => pendingRef.current?.reject(new SudoCancelledError())}
        />
      )}
    </SudoContext.Provider>
  );
}

function SudoModal({
  needsSetup,
  onSuccess,
  onCancel,
}: {
  needsSetup: boolean;
  onSuccess: (sudoToken: string, expiresAt: string) => void;
  onCancel: () => void;
}) {
  const { token } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  /** POST /auth/2fa/verify-sudo -> sudoToken de 30 min */
  const verify = async (otp: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/2fa/verify-sudo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: otp }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.message === 'string' ? data.message : 'Código incorrecto');
      onSuccess(data.sudoToken, data.expiresAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código incorrecto');
      setCode('');
      setBusy(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6) verify(code);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => !busy && onCancel()} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sudo-title"
        className="relative w-full max-w-lg space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label="Cancelar"
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-40"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 id="sudo-title" className="text-base font-bold text-white">
              {needsSetup ? 'Activa la autenticación en 2 pasos' : 'Confirma tu identidad'}
            </h2>
            <p className="text-xs text-slate-400">
              {needsSetup
                ? 'Para cambiar las llaves de pagos (Wompi) o la conexión de WhatsApp tu cuenta necesita Google Authenticator.'
                : 'Escribe el código de Google Authenticator. Quedarás en modo seguro durante 30 minutos.'}
            </p>
          </div>
        </div>

        {needsSetup ? (
          <>
            <TwoFactorSetup onEnabled={verify} />
            {busy && (
              <p className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Activando modo seguro...
              </p>
            )}
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
            <OtpInput value={code} onChange={setCode} autoFocus disabled={busy} />
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar
            </button>
          </form>
        )}
        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>
    </div>
  );
}
