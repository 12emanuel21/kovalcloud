'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import {
  SettingsCardFooter,
  SettingsCardHeader,
  SettingsFeedback,
  primaryButtonClass,
  settingsCardClass,
  settingsHintClass,
  settingsInputClass,
  settingsLabelClass,
} from './settings-ui';
import { useConfigPatch, useRestaurantPatch, type RestaurantSettings } from './useRestaurantSettings';
import { formatWhatsAppNumber, useWhatsAppLine } from './WhatsAppConnectionCard';

type Feedback = { type: 'success' | 'error'; text: string } | null;

interface CardProps {
  restaurant: RestaurantSettings;
  onSaved: (saved: Partial<RestaurantSettings>) => void;
}

/** Datos públicos del local: nombre, WhatsApp de atención, descripción y logo (PATCH /restaurants/:id) */
export function LocalDataCard({ restaurant, onSaved }: CardProps) {
  const patchRestaurant = useRestaurantPatch();
  // Si el WhatsApp está vinculado por QR, su SIM es la línea real de la carta
  const line = useWhatsAppLine();
  const botNumber = line.qrNumber ?? restaurant.whatsappBotNumber ?? null;

  const [name, setName] = useState(restaurant.name ?? '');
  const [phone, setPhone] = useState(restaurant.phone ?? '');
  const [description, setDescription] = useState(restaurant.description ?? '');
  const [logoUrl, setLogoUrl] = useState(restaurant.logoUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFeedback({ type: 'error', text: 'Escribe el nombre de tu local.' });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      // Vacío = no se cambia (mismo comportamiento que antes)
      const saved = await patchRestaurant(
        {
          name: name.trim(),
          phone: phone.trim() || undefined,
          description: description.trim() || undefined,
          logoUrl: logoUrl.trim() || undefined,
        },
        'No se pudieron guardar los datos del local',
      );
      onSaved({ name: saved.name, phone: saved.phone, description: saved.description, logoUrl: saved.logoUrl });
      setFeedback({ type: 'success', text: 'Datos del local guardados. Ya se ven en tu carta.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudieron guardar los datos del local' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className={settingsCardClass}>
      <SettingsCardHeader
        title="Datos del local"
        description="Lo que ven tus clientes en la carta digital."
        action={
          restaurant.slug ? (
            <Link
              href={`/menu/${restaurant.slug}`}
              target="_blank"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 transition hover:border-emerald-500/40 hover:text-emerald-300"
            >
              Ver mi carta
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null
        }
      />
      <div className="space-y-5 p-6">
        <SettingsFeedback feedback={feedback} />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <label className="block">
            <span className={settingsLabelClass}>
              Nombre del local <span className="text-emerald-400">*</span>
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Pizzería Nápoles"
              required
              className={settingsInputClass}
            />
          </label>

          <div>
            <label htmlFor="local-phone" className={settingsLabelClass}>
              WhatsApp de atención
            </label>
            <input
              id="local-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej. +57 300 123 4567"
              className={settingsInputClass}
            />
            {botNumber && (
              <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                Asistente conectado al {formatWhatsAppNumber(botNumber)}
              </p>
            )}
            <p className={settingsHintClass}>
              {botNumber
                ? 'Los pedidos van al número del asistente. Este queda de respaldo si lo desvinculas.'
                : 'A este número llegan los pedidos de la carta y el botón "Chatear por WhatsApp".'}
            </p>
          </div>

          <label className="block md:col-span-2">
            <span className={settingsLabelClass}>Descripción o eslogan</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Auténtica pizza italiana artesanal al horno de leña"
              rows={2}
              className={`${settingsInputClass} resize-none`}
            />
          </label>

          <label className="block md:col-span-2">
            <span className={settingsLabelClass}>Enlace del logo</span>
            <input
              type="text"
              inputMode="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://ejemplo.com/logo.png"
              className={settingsInputClass}
            />
          </label>
        </div>
      </div>
      <SettingsCardFooter hint="Se reflejan en tu carta al instante.">
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? 'Guardando...' : 'Guardar datos'}
        </button>
      </SettingsCardFooter>
    </form>
  );
}

/**
 * Dirección del local y medios de pago sin pasarela (Nequi, efectivo, datáfono): el bot los comparte
 * con quien no paga en línea. PATCH /restaurants/:id/config solo con estos dos campos.
 */
export function AddressPaymentsCard({ restaurant, onSaved }: CardProps) {
  const patchConfig = useConfigPatch();
  const [address, setAddress] = useState(restaurant.address ?? '');
  const [paymentDetails, setPaymentDetails] = useState(restaurant.paymentDetails ?? '');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      // Vacío = se borra (null en el backend)
      const saved = await patchConfig(
        { address: address.trim(), paymentDetails: paymentDetails.trim() },
        'No se pudieron guardar la dirección y los medios de pago',
      );
      onSaved({ address: saved.address ?? null, paymentDetails: saved.paymentDetails ?? null });
      setFeedback({ type: 'success', text: 'Dirección y medios de pago guardados.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'No se pudieron guardar la dirección y los medios de pago',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className={settingsCardClass}>
      <SettingsCardHeader title="Dirección y medios de pago" description="Dónde queda tu local y cómo te pueden pagar." />
      <div className="space-y-5 p-6">
        <SettingsFeedback feedback={feedback} />
        <label className="block">
          <span className={settingsLabelClass}>Dirección</span>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ej. Cra 45 # 26-85, Barrio Centro"
            maxLength={300}
            className={settingsInputClass}
          />
        </label>
        <label className="block">
          <span className={settingsLabelClass}>Medios de pago (Nequi, efectivo, datáfono)</span>
          <textarea
            value={paymentDetails}
            onChange={(e) => setPaymentDetails(e.target.value)}
            placeholder={'Ej. Nequi: 300 000 0000 - A nombre de Carlos Gómez\nEfectivo y datáfono en el local'}
            rows={3}
            maxLength={1000}
            className={`${settingsInputClass} resize-y`}
          />
          <span className={`block ${settingsHintClass}`}>
            El asistente se los comparte a los clientes que no pagan en línea.
          </span>
        </label>
      </div>
      <SettingsCardFooter hint="Los pagos con tarjeta o PSE se configuran en Avanzado › Pagos en línea.">
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </SettingsCardFooter>
    </form>
  );
}
