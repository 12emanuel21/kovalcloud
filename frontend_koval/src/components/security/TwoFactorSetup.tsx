'use client';

import React, { useState } from 'react';
import { Loader2, QrCode } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const API_URL = '/api';

async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const message = Array.isArray(data.message) ? data.message.join('. ') : data.message;
  return message || fallback;
}

/** Input de 6 dígitos (solo números, autocompletado de códigos OTP en móviles) */
export function OtpInput({
  value,
  onChange,
  autoFocus,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      autoFocus={autoFocus}
      disabled={disabled}
      placeholder="000000"
      aria-label="Código de 6 dígitos"
      className="w-40 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] text-white outline-none focus:border-emerald-500 disabled:opacity-50"
    />
  );
}

/**
 * Activación del 2FA: genera el QR (POST /auth/2fa/generate), el usuario lo escanea con
 * Google Authenticator / Authy y confirma con un código (POST /auth/2fa/enable).
 * `onEnabled` recibe el código usado (el modal de Sudo Mode lo reutiliza para elevar al instante).
 */
export function TwoFactorSetup({ onEnabled }: { onEnabled: (code: string) => void | Promise<void> }) {
  const { token } = useAuth();
  const [qr, setQr] = useState<{ qrCodeUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/2fa/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo generar el código QR'));
      setQr(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el código QR');
    } finally {
      setBusy(false);
    }
  };

  const enable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/2fa/enable`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'Código incorrecto'));
      await onEnabled(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código incorrecto');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (!qr) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
          Activar autenticación en 2 pasos
        </button>
        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={enable} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URI generado por el backend */}
        <img src={qr.qrCodeUrl} alt="Código QR para Google Authenticator" className="h-40 w-40 shrink-0 rounded-xl bg-white p-2" />
        <div className="space-y-2 text-xs text-slate-300">
          <p>
            <span className="font-bold text-white">1.</span> Abre Google Authenticator (o Authy) y escanea el código.
          </p>
          <p className="text-slate-500">
            ¿No puedes escanear? Ingresa esta clave manualmente:
            <code className="mt-1 block break-all rounded bg-slate-900 px-2 py-1 font-mono text-emerald-300">{qr.secret}</code>
          </p>
          <p>
            <span className="font-bold text-white">2.</span> Escribe el código de 6 dígitos que aparece en la app.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <OtpInput value={code} onChange={setCode} autoFocus disabled={busy} />
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Verificar y activar
        </button>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </form>
  );
}
