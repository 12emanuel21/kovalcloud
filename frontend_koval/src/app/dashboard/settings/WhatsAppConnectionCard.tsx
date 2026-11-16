'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, QrCode } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { SettingsCardHeader, primaryButtonClass, settingsCardClass } from './settings-ui';
import { SETTINGS_API_URL } from './useRestaurantSettings';

/** "573001234567" -> "+57 300 123 4567" (otros países: "+<dígitos>") */
export function formatWhatsAppNumber(digits: string): string {
  const co = /^57(\d{3})(\d{3})(\d{4})$/.exec(digits);
  return co ? `+57 ${co[1]} ${co[2]} ${co[3]}` : `+${digits}`;
}

/** Número de la SIM vinculada por QR desde el JID ("573001234567:12@s.whatsapp.net") */
function phoneFromJid(jid: string | undefined): string | null {
  const digits = (jid ?? '').split('@')[0].split(':')[0].replace(/\D/g, '');
  return /^\d{10,15}$/.test(digits) ? digits : null;
}

type QrStatus = 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED';

export interface WhatsAppLine {
  loading: boolean;
  /** Estado de la sesión por QR (WhatsApp Web); null si no se pudo consultar */
  qrStatus: QrStatus | null;
  /** Número de la SIM conectada por QR */
  qrNumber: string | null;
  /** Línea oficial de Meta configurada (token + Phone ID) */
  metaConfigured: boolean;
}

/** Estado de la línea de WhatsApp del local: sesión por QR en vivo y credenciales de Meta */
export function useWhatsAppLine(options: { withMeta?: boolean } = {}): WhatsAppLine {
  const { restaurantId, token } = useAuth();
  const withMeta = options.withMeta ?? false;
  const [line, setLine] = useState<WhatsAppLine>({ loading: true, qrStatus: null, qrNumber: null, metaConfigured: false });

  useEffect(() => {
    if (!restaurantId || !token) return;
    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };
    const qr = fetch(`${SETTINGS_API_URL}/whatsapp-gateway/status?restaurantId=${encodeURIComponent(restaurantId)}`, {
      cache: 'no-store',
      headers,
    })
      .then((res) => (res.ok ? (res.json() as Promise<{ status?: QrStatus; user?: { id?: string } | null }>) : null))
      .catch(() => null);
    const meta = withMeta
      ? fetch(`${SETTINGS_API_URL}/restaurants/${encodeURIComponent(restaurantId)}/whatsapp-config`, { cache: 'no-store', headers })
          .then((res) => (res.ok ? (res.json() as Promise<{ hasWhatsappToken?: boolean; whatsappPhoneId?: string | null }>) : null))
          .catch(() => null)
      : Promise.resolve(null);

    Promise.all([qr, meta]).then(([qrData, metaData]) => {
      if (cancelled) return;
      setLine({
        loading: false,
        qrStatus: qrData?.status ?? null,
        qrNumber: qrData?.status === 'CONNECTED' ? phoneFromJid(qrData.user?.id) : null,
        metaConfigured: Boolean(metaData?.hasWhatsappToken && metaData.whatsappPhoneId),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, token, withMeta]);

  return line;
}

const STEPS = [
  'Abre WhatsApp en el celular del local.',
  'Entra a "Dispositivos vinculados" y toca "Vincular dispositivo".',
  'Escanea el código QR que te mostramos.',
];

/**
 * Ajustes > WhatsApp: estado de la línea del bot en lenguaje simple y el camino corto (código QR).
 * La API oficial de Meta queda como opción avanzada en el centro de conexiones.
 */
export function WhatsAppConnectionCard({ botNumber }: { botNumber?: string | null }) {
  const line = useWhatsAppLine({ withMeta: true });
  const qrConnected = line.qrStatus === 'CONNECTED';
  const connected = qrConnected || line.metaConfigured;
  const number = line.qrNumber ?? botNumber ?? null;

  const status = line.loading
    ? { tone: 'text-slate-400', dot: 'bg-slate-500', title: 'Consultando tu conexión...', detail: '' }
    : qrConnected
      ? {
          tone: 'text-emerald-300',
          dot: 'bg-emerald-400',
          title: number ? `Conectado al ${formatWhatsAppNumber(number)}` : 'Conectado por código QR',
          detail: 'El asistente responde a tus clientes y tu carta envía los pedidos a este número.',
        }
      : line.metaConfigured
        ? {
            tone: 'text-emerald-300',
            dot: 'bg-emerald-400',
            title: number ? `Línea oficial de Meta · ${formatWhatsAppNumber(number)}` : 'Conectado con la API oficial de Meta',
            detail: 'El asistente responde desde tu línea oficial de WhatsApp Business.',
          }
        : line.qrStatus === 'QR_READY' || line.qrStatus === 'CONNECTING'
          ? {
              tone: 'text-amber-300',
              dot: 'bg-amber-400',
              title: 'Vinculación en curso',
              detail: 'Termina de escanear el código QR para que el asistente empiece a responder.',
            }
          : line.qrStatus === null
            ? {
                tone: 'text-amber-300',
                dot: 'bg-amber-400',
                title: 'No pudimos consultar tu conexión',
                detail: 'Intenta de nuevo en unos minutos. Si el problema sigue, escríbenos desde Soporte.',
              }
            : {
                tone: 'text-rose-300',
                dot: 'bg-rose-400',
                title: 'Sin conectar',
                detail: 'El asistente no puede responder hasta que vincules el WhatsApp de tu local.',
              };

  return (
    <section className={settingsCardClass}>
      <SettingsCardHeader title="WhatsApp" description="El número con el que el asistente atiende a tus clientes y recibe los pedidos." />
      <div className="space-y-5 p-6">
        <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4" aria-live="polite">
          <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${status.dot}`} aria-hidden />
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${status.tone}`}>{status.title}</p>
            {status.detail && <p className="mt-0.5 text-sm text-slate-400">{status.detail}</p>}
          </div>
        </div>

        {!line.loading && !connected && (
          <ol className="space-y-2">
            {STEPS.map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-sm text-slate-300">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-xs font-bold text-emerald-400">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/dashboard/whatsapp?modo=qr" className={`${primaryButtonClass} min-h-11`}>
            <QrCode className="h-4 w-4" aria-hidden />
            {qrConnected ? 'Ver o cambiar la conexión' : 'Vincular con código QR'}
          </Link>
          <Link
            href="/dashboard/whatsapp?modo=meta"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-slate-400 transition hover:text-emerald-300"
          >
            Usar la API oficial de Meta (avanzado)
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
