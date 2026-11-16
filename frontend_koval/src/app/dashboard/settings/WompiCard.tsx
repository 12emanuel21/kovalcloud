'use client';

import React, { useEffect, useState } from 'react';
import { CreditCard, Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { SettingsCardFooter, SettingsFeedback, primaryButtonClass, settingsCardClass, settingsInputClass } from './settings-ui';
import { SETTINGS_API_URL as API_URL, apiErrorMessage, useConfigPatch } from './useRestaurantSettings';

const inputClass = settingsInputClass;

/** GET /restaurants/:id/payments-config y respuesta del PATCH: secretos solo enmascarados */
interface PaymentsConfig {
  wompiPublicKey: string | null;
  wompiEnvironment: 'sandbox' | 'production' | null;
  hasWompiPrivateKey: boolean;
  wompiPrivateKeyMasked: string | null;
  hasWompiEventSecret: boolean;
  wompiEventSecretMasked: string | null;
  hasWompiIntegritySecret: boolean;
  wompiIntegritySecretMasked: string | null;
  /** Llaves completas (pública + eventos + integridad) */
  wompiReady: boolean;
  /** Interruptor manual del dueño */
  isWompiEnabled: boolean;
  /** Cobrando de verdad: llaves completas e interruptor encendido */
  onlinePaymentsEnabled: boolean;
}

type WompiSecretField = 'wompiPrivateKey' | 'wompiEventSecret' | 'wompiIntegritySecret';

const WOMPI_SECRET_FIELDS: Array<{
  field: WompiSecretField;
  label: string;
  placeholder: string;
  masked: (c: PaymentsConfig | null) => string | null;
}> = [
  { field: 'wompiPrivateKey', label: 'Llave Privada', placeholder: 'prv_test_...', masked: (c) => c?.wompiPrivateKeyMasked ?? null },
  { field: 'wompiEventSecret', label: 'Secreto de Eventos', placeholder: 'test_events_...', masked: (c) => c?.wompiEventSecretMasked ?? null },
  {
    field: 'wompiIntegritySecret',
    label: 'Secreto de Integridad',
    placeholder: 'test_integrity_...',
    masked: (c) => c?.wompiIntegritySecretMasked ?? null,
  },
];

const EMPTY_SECRETS: Record<WompiSecretField, string> = { wompiPrivateKey: '', wompiEventSecret: '', wompiIntegritySecret: '' };


/**
 * Avanzado › Pagos en línea: llaves de Wompi e interruptor de cobros. Guarda solo las llaves
 * (PATCH /restaurants/:id/config); cambiarlas pide el código 2FA (Sudo Mode).
 */
export function WompiCard() {
  const { restaurantId, token } = useAuth();
  const patchConfig = useConfigPatch();

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // La llave pública se edita tal cual; los secretos vacíos = conservar el guardado
  const [payments, setPayments] = useState<PaymentsConfig | null>(null);
  const [wompiPublicKey, setWompiPublicKey] = useState('');
  const [wompiSecrets, setWompiSecrets] = useState<Record<WompiSecretField, string>>(EMPTY_SECRETS);
  const [disconnectingWompi, setDisconnectingWompi] = useState(false);
  const [togglingWompi, setTogglingWompi] = useState(false);

  // Configuración de Wompi (endpoint aparte: solo OWNER/SUPERADMIN, secretos enmascarados)
  useEffect(() => {
    if (!restaurantId || !token) return;
    let cancelled = false;
    fetch(`${API_URL}/restaurants/${restaurantId}/payments-config`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo cargar la configuración de pagos'));
        return res.json() as Promise<PaymentsConfig>;
      })
      .then((data) => {
        if (cancelled) return;
        setPayments(data);
        setWompiPublicKey(data.wompiPublicKey ?? '');
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo cargar la configuración de pagos' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, token]);

  /** Aplica la respuesta del backend (PATCH config) a la sección de Wompi */
  const applyPaymentsResponse = (data: Partial<PaymentsConfig>) => {
    if (!('hasWompiPrivateKey' in data)) return;
    const config = data as PaymentsConfig;
    setPayments(config);
    setWompiPublicKey(config.wompiPublicKey ?? '');
    setWompiSecrets(EMPTY_SECRETS);
  };

  /** Interruptor manual: se guarda al instante para poder apagar la pasarela en un clic */
  const handleToggleWompi = async (enabled: boolean) => {
    setTogglingWompi(true);
    setFeedback(null);
    try {
      const data = (await patchConfig(
        { isWompiEnabled: enabled },
        'No se pudo cambiar el estado de los cobros en línea',
      )) as unknown as PaymentsConfig;
      // Solo el interruptor: no pisa llaves que el usuario esté escribiendo
      setPayments(data);
      setFeedback({
        type: 'success',
        text: enabled ? 'Cobros en línea habilitados: la carta ya ofrece "Pagar en línea".' : 'Cobros en línea deshabilitados.',
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo cambiar el estado de los cobros en línea' });
    } finally {
      setTogglingWompi(false);
    }
  };

  const handleDisconnectWompi = async () => {
    if (!window.confirm('¿Quitar la configuración de Wompi? Tus clientes no podrán pagar en línea hasta que la vuelvas a configurar.')) {
      return;
    }
    setDisconnectingWompi(true);
    setFeedback(null);
    try {
      const data = await patchConfig(
        {
          isWompiEnabled: false,
          wompiPublicKey: null,
          wompiPrivateKey: null,
          wompiEventSecret: null,
          wompiIntegritySecret: null,
        },
        'No se pudo quitar la configuración de Wompi',
      );
      applyPaymentsResponse(data as unknown as Partial<PaymentsConfig>);
      setFeedback({ type: 'success', text: 'Configuración de Wompi eliminada.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo quitar la configuración de Wompi' });
    } finally {
      setDisconnectingWompi(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payments) return;
    // Secretos: solo se envían los que el usuario escribió (vacío = conservar)
    const secrets = Object.fromEntries(
      Object.entries(wompiSecrets)
        .map(([field, value]) => [field, value.trim()])
        .filter(([, value]) => value),
    );
    setSaving(true);
    setFeedback(null);
    try {
      const wasEnabled = payments.isWompiEnabled;
      const saved = (await patchConfig(
        { wompiPublicKey: wompiPublicKey.trim(), ...secrets },
        'No se pudieron guardar las llaves de Wompi',
      )) as unknown as Partial<PaymentsConfig>;
      applyPaymentsResponse(saved);
      // Al completar las 4 llaves el backend enciende Wompi; si siguen completas pero apagado, se avisa
      const note =
        saved.onlinePaymentsEnabled && !wasEnabled
          ? ' Wompi quedó activado: tu carta ya ofrece "Pagar en línea".'
          : saved.wompiReady && saved.isWompiEnabled === false
            ? ' Las llaves están completas pero los cobros en línea siguen apagados: actívalos con el interruptor.'
            : '';
      setFeedback({ type: 'success', text: `Llaves de Wompi guardadas.${note}` });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudieron guardar las llaves de Wompi' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className={settingsCardClass} aria-labelledby="wompi-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <CreditCard className="h-4 w-4" />
          </span>
          <div>
            <h2 id="wompi-title" className="text-base font-semibold text-white">Pagos en línea (Wompi)</h2>
            <p className="text-sm text-slate-400">Cobra en línea con tarjeta, Nequi, PSE y Bancolombia.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {payments?.onlinePaymentsEnabled ? (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
              {payments.wompiEnvironment === 'production' ? 'Activo · Producción' : 'Activo · Sandbox'}
            </span>
          ) : payments?.wompiReady ? (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-300">
              Apagado
            </span>
          ) : (
            <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 text-[10px] font-bold text-slate-400">
              Sin configurar
            </span>
          )}
        </div>
      </div>

      {feedback && (
        <div className="px-6 pt-5">
          <SettingsFeedback feedback={feedback} />
        </div>
      )}

      {/* Interruptor manual: aunque las llaves estén completas, apagado = la carta no cobra en línea */}
      <div className="px-6 py-5">
        <label
          className={`flex items-center justify-between gap-4 rounded-xl border p-4 transition ${
            payments?.isWompiEnabled ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60'
          } ${!payments || togglingWompi || (!payments.wompiReady && !payments.isWompiEnabled) ? 'opacity-60' : 'cursor-pointer'}`}
        >
          <span>
            <span className="block text-sm font-bold text-white">Habilitar cobros en línea con Wompi</span>
            <span className="block text-xs text-slate-400">
              {!payments
                ? 'Cargando configuración de pagos...'
                : payments.isWompiEnabled
                  ? 'Tus clientes ven el botón "Pagar en línea" en el carrito.'
                  : payments.wompiReady
                    ? 'Apagado: el carrito solo ofrece pago en efectivo / WhatsApp.'
                    : 'Completa y guarda las llaves de Wompi para poder encenderlo.'}
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="peer sr-only"
            checked={Boolean(payments?.isWompiEnabled)}
            disabled={!payments || togglingWompi || (!payments.wompiReady && !payments.isWompiEnabled)}
            onChange={(e) => handleToggleWompi(e.target.checked)}
            aria-describedby="wompi-title"
          />
          <span
            aria-hidden
            className="relative h-7 w-12 shrink-0 rounded-full bg-slate-700 transition peer-checked:bg-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
          />
        </label>
      </div>

      <div className="space-y-4 border-t border-slate-800/80 px-6 py-5">
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <Lock className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          Por seguridad, cambiar estas llaves te pedirá el código de Google Authenticator.
        </p>
        <div>
          <label htmlFor="wompi-public-key" className="mb-1.5 block text-xs font-semibold text-slate-300">
            Llave Pública
          </label>
          <input
            id="wompi-public-key"
            type="text"
            value={wompiPublicKey}
            onChange={(e) => setWompiPublicKey(e.target.value)}
            placeholder="pub_test_... o pub_prod_..."
            autoComplete="off"
            spellCheck={false}
            className={`${inputClass} font-mono`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {WOMPI_SECRET_FIELDS.map(({ field, label, placeholder, masked }) => {
            const saved = masked(payments);
            return (
              <div key={field}>
                <label htmlFor={field} className="mb-1.5 block text-xs font-semibold text-slate-300">
                  {label}
                </label>
                <input
                  id={field}
                  type="password"
                  value={wompiSecrets[field]}
                  onChange={(e) => setWompiSecrets((prev) => ({ ...prev, [field]: e.target.value }))}
                  placeholder={saved ? `Guardado ${saved}` : placeholder}
                  autoComplete="new-password"
                  spellCheck={false}
                  className={`${inputClass} font-mono`}
                />
                <p className="mt-1 text-xs text-slate-500">
                  {saved ? 'Déjalo vacío para conservar el actual.' : 'Aún no configurado.'}
                </p>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs leading-relaxed text-slate-400">
          Encuéntralas en tu panel de Wompi → <span className="text-slate-300">Desarrolladores</span>. En
          &quot;URL de eventos&quot; configura:{' '}
          <code className="break-all rounded bg-slate-950 px-1.5 py-0.5 font-mono text-emerald-300">
            {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/wompi
          </code>
          . No mezcles llaves de prueba (test) con llaves de producción (prod).
        </div>

        {(payments?.wompiPublicKey || payments?.hasWompiPrivateKey || payments?.hasWompiEventSecret || payments?.hasWompiIntegritySecret) && (
          <button
            type="button"
            onClick={handleDisconnectWompi}
            disabled={disconnectingWompi}
            className="min-h-10 cursor-pointer rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
          >
            {disconnectingWompi ? 'Quitando...' : 'Quitar configuración de Wompi'}
          </button>
        )}
      </div>
      <SettingsCardFooter hint="Los secretos que dejes vacíos conservan el valor guardado.">
        <button type="submit" disabled={saving || !payments} className={primaryButtonClass}>
          {saving ? 'Guardando...' : 'Guardar llaves'}
        </button>
      </SettingsCardFooter>
    </form>
  );
}
