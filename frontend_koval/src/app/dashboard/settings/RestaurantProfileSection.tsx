'use client';

import React, { useEffect, useState } from 'react';
import { CreditCard, Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSudoMode } from '@/context/SudoContext';
import { TwoFactorSection } from '@/components/security/TwoFactorSection';
import { WEEK_DAYS, type BusinessHours, type WeekDay } from '@/lib/business-hours';
import { DEFAULT_MENU_THEME, MENU_THEMES, isMenuTheme, type MenuTheme } from '@/lib/menu-themes';
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

const API_URL = typeof window !== 'undefined' ? '/api' : 'http://koval_backend:4000';

interface RestaurantConfig {
  address?: string | null;
  paymentDetails?: string | null;
  businessHours?: BusinessHours | null;
  isTemporarilyClosed?: boolean;
  closedMessage?: string | null;
  theme?: string | null;
}

/** Mensaje legible de un error de la API (ValidationPipe devuelve message como arreglo) */
async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const message = Array.isArray(data.message) ? data.message.join('. ') : data.message;
  return message || fallback;
}

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
  wompiReady: boolean;
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

const inputClass =
  'w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white outline-none transition';

/**
 * Perfil operativo del local: dirección, datos de pago, tema de la carta, horarios y cierre de emergencia.
 * Guarda con PATCH /restaurants/:id/config (solo OWNER del local o SUPERADMIN).
 */
export function RestaurantProfileSection() {
  const { restaurantId, token } = useAuth();
  // PATCH /config está en Sudo Mode: ante 403 SUDO_REQUIRED se pide el código 2FA y se reintenta
  const { sudoFetch } = useSudoMode();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [address, setAddress] = useState('');
  const [paymentDetails, setPaymentDetails] = useState('');
  const [isTemporarilyClosed, setIsTemporarilyClosed] = useState(false);
  const [closedMessage, setClosedMessage] = useState('');
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [theme, setTheme] = useState<MenuTheme>(DEFAULT_MENU_THEME);

  // Wompi: la llave pública se edita tal cual; los secretos vacíos = conservar el guardado
  const [payments, setPayments] = useState<PaymentsConfig | null>(null);
  const [wompiPublicKey, setWompiPublicKey] = useState('');
  const [wompiSecrets, setWompiSecrets] = useState<Record<WompiSecretField, string>>(EMPTY_SECRETS);
  const [disconnectingWompi, setDisconnectingWompi] = useState(false);

  // Carga inicial: setState solo en callbacks de la promesa (nunca síncrono en el efecto)
  useEffect(() => {
    if (!restaurantId || !token) return;
    let cancelled = false;
    fetch(`${API_URL}/restaurants/${restaurantId}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo cargar el perfil del local'));
        return res.json() as Promise<RestaurantConfig>;
      })
      .then((data) => {
        if (cancelled) return;
        setAddress(data.address ?? '');
        setPaymentDetails(data.paymentDetails ?? '');
        setIsTemporarilyClosed(Boolean(data.isTemporarilyClosed));
        setClosedMessage(data.closedMessage ?? '');
        setBlocks(hoursToBlocks(data.businessHours));
        setTheme(isMenuTheme(data.theme) ? data.theme : DEFAULT_MENU_THEME);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo cargar el perfil del local' });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, token]);

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

  const handleDisconnectWompi = async () => {
    if (!window.confirm('¿Quitar la configuración de Wompi? Tus clientes no podrán pagar en línea hasta que la vuelvas a configurar.')) {
      return;
    }
    setDisconnectingWompi(true);
    setFeedback(null);
    try {
      const res = await sudoFetch(`${API_URL}/restaurants/${restaurantId}/config`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ wompiPublicKey: null, wompiPrivateKey: null, wompiEventSecret: null, wompiIntegritySecret: null }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo quitar la configuración de Wompi'));
      applyPaymentsResponse(await res.json());
      setFeedback({ type: 'success', text: 'Configuración de Wompi eliminada.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo quitar la configuración de Wompi' });
    } finally {
      setDisconnectingWompi(false);
    }
  };

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
      // Secretos de Wompi: solo se envían los que el usuario escribió (vacío = conservar)
      const secrets = Object.fromEntries(
        Object.entries(wompiSecrets)
          .map(([field, value]) => [field, value.trim()])
          .filter(([, value]) => value),
      );
      const payload: RestaurantConfig & Record<string, unknown> = {
        address: address.trim(),
        paymentDetails: paymentDetails.trim(),
        businessHours: blocksToHours(blocks),
        isTemporarilyClosed,
        closedMessage: closedMessage.trim(),
        theme,
        // Solo si ya se cargó la configuración de Wompi: si no, se borraría la llave guardada
        ...(payments ? { wompiPublicKey: wompiPublicKey.trim() } : {}),
        ...secrets,
      };
      const res = await sudoFetch(`${API_URL}/restaurants/${restaurantId}/config`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo guardar el perfil del local'));
      applyPaymentsResponse(await res.json());
      setFeedback({ type: 'success', text: 'Perfil del local guardado correctamente.' });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo guardar el perfil del local' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 md:p-8 text-xs text-slate-500">
        Cargando perfil del local...
      </section>
    );
  }

  return (
    <>
    <form
      onSubmit={handleSave}
      className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-sm border border-amber-500/20">
          🏪
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Perfil del Local</h2>
          <p className="text-xs text-slate-400">Dirección, medios de pago, horarios de atención y cierre de emergencia.</p>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs border ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Cierre de emergencia */}
      <div
        className={`p-4 rounded-2xl border space-y-3 transition ${
          isTemporarilyClosed ? 'bg-rose-500/10 border-rose-500/40' : 'bg-slate-950/60 border-slate-800/80'
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className={`text-sm font-bold ${isTemporarilyClosed ? 'text-rose-300' : 'text-white'}`}>
              Cierre de Emergencia
            </h3>
            <p className="text-[11px] text-slate-400">
              Marca el local como cerrado temporalmente, sin importar el horario.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isTemporarilyClosed}
            aria-label="Cierre de emergencia"
            onClick={() => setIsTemporarilyClosed((v) => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition cursor-pointer ${
              isTemporarilyClosed ? 'bg-rose-600 border-rose-500' : 'bg-slate-700 border-slate-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                isTemporarilyClosed ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Mensaje de Cierre</label>
          <input
            type="text"
            value={closedMessage}
            onChange={(e) => setClosedMessage(e.target.value)}
            placeholder="Ej. Hoy cerramos por mantenimiento, volvemos mañana a las 11:00"
            maxLength={300}
            className={inputClass}
          />
        </div>
      </div>

      {/* Dirección y pagos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Dirección</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ej. Cra 45 # 26-85, Barrio Centro"
            maxLength={300}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Datos de Pago / Nequi</label>
          <textarea
            value={paymentDetails}
            onChange={(e) => setPaymentDetails(e.target.value)}
            placeholder={'Ej. Nequi 300 123 4567 (Juan Pérez)\nEfectivo y datáfono en el local'}
            rows={3}
            maxLength={1000}
            className={`${inputClass} resize-y`}
          />
        </div>
      </div>

      {/* Tema de la carta pública */}
      <div className="max-w-sm">
        <label htmlFor="menu-theme" className="block text-[11px] font-semibold text-slate-400 mb-1">
          Tema del Menú Web
        </label>
        <select
          id="menu-theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value as MenuTheme)}
          className={`${inputClass} [color-scheme:dark]`}
        >
          {MENU_THEMES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-slate-500 mt-1">Diseño que ven tus clientes al abrir la carta o escanear el QR.</p>
      </div>

      {/* Pagos en línea (Wompi) */}
      <section aria-labelledby="wompi-title" className="rounded-2xl border border-emerald-500/20 bg-slate-950/80">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <CreditCard className="h-4 w-4" />
            </span>
            <div>
              <h3 id="wompi-title" className="text-sm font-bold text-white">Configuración de Pagos (Wompi)</h3>
              <p className="text-[11px] text-slate-400">Cobra en línea con tarjeta, Nequi, PSE y Bancolombia.</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {payments?.wompiReady ? (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                {payments.wompiEnvironment === 'production' ? 'Activo · Producción' : 'Activo · Sandbox'}
              </span>
            ) : (
              <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 text-[10px] font-bold text-slate-400">
                Sin configurar
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4 border-t border-slate-800/80 p-4">
          <p className="flex items-center gap-2 text-[11px] text-slate-400">
            <Lock className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            Por seguridad, cambiar estas llaves te pedirá el código de Google Authenticator.
          </p>
          <div>
            <label htmlFor="wompi-public-key" className="block text-[11px] font-semibold text-slate-400 mb-1">
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
                  <label htmlFor={field} className="block text-[11px] font-semibold text-slate-400 mb-1">
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
                  <p className="mt-1 text-[10px] text-slate-500">
                    {saved ? 'Déjalo vacío para conservar el actual.' : 'Aún no configurado.'}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-[11px] leading-relaxed text-slate-400">
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
              className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50 cursor-pointer"
            >
              {disconnectingWompi ? 'Quitando...' : 'Quitar configuración de Wompi'}
            </button>
          )}
        </div>
      </section>

      {/* Horarios: bloques tipo alarma (franja + días) */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-white">Horarios de Atención</h3>
          <p className="text-[11px] text-slate-400">
            Crea un bloque por cada franja y marca los días en que aplica. Para turnos partidos o fines de
            semana distintos, agrega otro bloque.
          </p>
        </div>

        {blocks.length === 0 ? (
          <div className="p-5 rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 text-center space-y-1">
            <p className="text-xs font-semibold text-slate-300">Sin horario configurado</p>
            <p className="text-[11px] text-slate-500">
              La carta y el bot consideran el local abierto siempre (salvo el cierre de emergencia).
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {blocks.map((block, index) => {
              const overnight = Boolean(block.open && block.close && block.close < block.open);
              return (
                <div
                  key={block.id}
                  className="p-4 rounded-2xl border border-slate-800/80 bg-slate-950/60 space-y-4 shadow-inner"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                        Horario {index + 1}
                      </p>
                      <p className="text-xs text-slate-400 truncate">
                        {describeDays(block.days)} · {block.open || '--:--'} – {block.close || '--:--'}
                        {overnight && ' (cierra al día siguiente)'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeBlock(block.id)}
                      aria-label={`Eliminar horario ${index + 1}`}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition cursor-pointer"
                    >
                      Eliminar
                    </button>
                  </div>

                  <div className="flex flex-wrap items-end gap-3">
                    <label className="space-y-1">
                      <span className="block text-[11px] font-semibold text-slate-400">Abre</span>
                      <input
                        type="time"
                        value={block.open}
                        onChange={(e) => updateBlock(block.id, { open: e.target.value })}
                        required
                        className="bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-sm font-mono text-white outline-none [color-scheme:dark]"
                      />
                    </label>
                    <span className="pb-2 text-slate-600">→</span>
                    <label className="space-y-1">
                      <span className="block text-[11px] font-semibold text-slate-400">Cierra</span>
                      <input
                        type="time"
                        value={block.close}
                        onChange={(e) => updateBlock(block.id, { close: e.target.value })}
                        required
                        className="bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-sm font-mono text-white outline-none [color-scheme:dark]"
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
                          className={`h-9 w-9 rounded-full text-xs font-bold border transition cursor-pointer ${
                            selected
                              ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-md shadow-emerald-950/50'
                              : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                          }`}
                        >
                          {DAY_PILLS[day].short}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={addBlock}
          className="w-full py-2.5 rounded-2xl border border-dashed border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/5 hover:border-emerald-400 text-xs font-bold transition cursor-pointer"
        >
          {blocks.length === 0 ? '+ Agregar horario' : '+ Agregar otro horario'}
        </button>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold transition shadow-md shadow-emerald-950/50 cursor-pointer"
        >
          {saving ? 'Guardando...' : 'Guardar Perfil del Local'}
        </button>
      </div>
    </form>

    <TwoFactorSection />
    </>
  );
}
