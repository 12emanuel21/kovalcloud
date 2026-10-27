'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSudoMode } from '@/context/SudoContext';
import Link from 'next/link';
import { ArrowRight, ExternalLink, MessageCircle } from 'lucide-react';
import { TwoFactorSection } from '@/components/security/TwoFactorSection';
import { TeamSection } from './TeamSection';
import { RestaurantProfileSection } from './RestaurantProfileSection';
import {
  SettingsCardFooter,
  SettingsCardHeader,
  SettingsFeedback,
  SettingsPanel,
  SettingsTabs,
  primaryButtonClass,
  settingsCardClass,
  type SettingsTab,
} from './settings-ui';

const API_URL = typeof window !== "undefined" ? "/api" : "http://koval_backend:4000";

interface RestaurantData {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  currency?: string | null;
  owner?: {
    id: string;
    email: string;
    role: string;
  };
  plan?: {
    id: string;
    name: string;
    price: number;
  };
}

export default function SettingsPage() {
  const { restaurantId , token} = useAuth();
  // PATCH /restaurants/:id: el backend pide Sudo Mode solo si cambian credenciales de Meta
  const { sudoFetch } = useSudoMode();

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Campos de Identidad de Marca
  const [name, setName] = useState<string>('');
  const [slug, setSlug] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [currency, setCurrency] = useState<string>('COP');
  const [description, setDescription] = useState<string>('');
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [bannerUrl, setBannerUrl] = useState<string>('');
  const [ownerEmail, setOwnerEmail] = useState<string>('');
  const [planName, setPlanName] = useState<string>('Plan Pro');

  // Pestaña activa de Ajustes
  const [activeTab, setActiveTab] = useState<SettingsTab>('perfil');


  
  // Cargar datos actuales del restaurante
  const fetchRestaurantSettings = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/restaurants/${restaurantId}`, {
        cache: 'no-store',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error('No se pudo cargar la configuración del restaurante');
      }
      const data: RestaurantData = await res.json();
      setName(data.name || '');
      setSlug(data.slug || '');
      setPhone(data.phone || '');
      setCurrency(data.currency || 'COP');
      setDescription(data.description || '');
      setLogoUrl(data.logoUrl || '');
      setBannerUrl(data.bannerUrl || '');
      const email = data.owner?.email || 'admin@kovalcloud.com';
      setOwnerEmail(email);
      if (data.plan?.name) setPlanName(data.plan.name);
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', text: 'Error al conectar con la API de configuración.' });
    } finally {
      setLoading(false);
    }
  }, [restaurantId, token]);

  useEffect(() => {
    fetchRestaurantSettings();
  }, [fetchRestaurantSettings]);

  // Guardar Cambios de Identidad
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) {
      setFeedback({ type: 'error', text: 'El nombre y el slug del restaurante son obligatorios.' });
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const payload = {
        name: name.trim(),
        slug: slug.trim().toLowerCase().replace(/\s+/g, '-'),
        phone: phone.trim() || undefined,
        currency,
        description: description.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
        bannerUrl: bannerUrl.trim() || undefined,
      };

      const res = await sudoFetch(`${API_URL}/restaurants/${restaurantId}`, {
        method: 'PATCH',
        headers: {
        'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Error al guardar cambios');
      }

      setFeedback({ type: 'success', text: '¡Datos del restaurante guardados exitosamente!' });
      setTimeout(() => setFeedback(null), 5000);
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al actualizar configuración',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <svg className="animate-spin h-5 w-5 text-emerald-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
        <p className="text-xs text-slate-400 font-semibold">Cargando ajustes del restaurante...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Barra de herramientas (el título lo muestra el TopBar) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-sm text-slate-400">Administra tu local, tus horarios, tus pagos y la seguridad de tu cuenta.</p>
        <span className="inline-flex w-fit items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          {planName}
        </span>
      </div>

      {/* Banner global de acceso rápido a WhatsApp */}
      <div className={`${settingsCardClass} flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4`}>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
            <MessageCircle className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-white">Conexión a WhatsApp</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Configura tu línea oficial de Meta Cloud API o vincula WhatsApp Web en el centro de conexiones.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/whatsapp"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/60 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-emerald-500/40 hover:text-emerald-300"
        >
          Ir a Conexión WhatsApp
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <SettingsTabs active={activeTab} onChange={setActiveTab} />

      <SettingsPanel tab={activeTab}>
        {/* PERFIL: identidad de marca y enlace del menú (PATCH /restaurants/:id) */}
        {activeTab === 'perfil' && (
          <form onSubmit={handleSaveSettings} className={settingsCardClass}>
            <SettingsCardHeader
              title="Identidad de marca"
              description="Datos públicos de tu local en la carta digital."
              action={
                slug ? (
                  <Link
                    href={`/menu/${slug}`}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-emerald-500/40 hover:text-emerald-300"
                  >
                    Ver carta
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                ) : null
              }
            />
            <div className="space-y-6 p-6">
              <SettingsFeedback feedback={feedback} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Nombre del Restaurante <span className="text-emerald-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Pizzería Nápoles"
            required
            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-lg px-3.5 py-2.5 text-sm text-white outline-none transition"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Slug (Enlace Web del Menú) <span className="text-emerald-400">*</span>
          </label>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="pizzeria-napoles"
            required
            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-lg px-3.5 py-2.5 text-sm font-mono text-emerald-400 outline-none transition"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Tu menú digital está disponible en:{' '}
            <Link
              href={`/menu/${slug}`}
              target="_blank"
              className="text-emerald-400 hover:underline font-mono"
            >
              /menu/{slug}
            </Link>
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            WhatsApp del Local (Teléfono Comercial)
          </label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Ej. +57 300 123 4567"
            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-lg px-3.5 py-2.5 text-sm text-white outline-none transition"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            {phone.trim()
              ? 'A este número llegan los pedidos en efectivo de la carta y el botón "Chatear por WhatsApp".'
              : 'Sin este número la carta no puede abrir el chat de WhatsApp con tu local.'}
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Moneda de Operación
          </label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-lg px-3.5 py-2.5 text-sm text-white outline-none transition"
          >
            <option value="COP">COP ($ Pesos Colombianos)</option>
            <option value="USD">USD ($ Dólares Estadounidenses)</option>
            <option value="MXN">MXN ($ Pesos Mexicanos)</option>
            <option value="EUR">EUR (€ Euros)</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Descripción o Eslogan del Restaurante
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej. Auténtica pizza italiana artesanal al horno de leña..."
            rows={2}
            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-lg px-3.5 py-2.5 text-sm text-white outline-none transition resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            URL del Logo
          </label>
          <input
            type="text"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://ejemplo.com/logo.png"
            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-lg px-3.5 py-2.5 text-xs text-white outline-none transition"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            URL del Banner
          </label>
          <input
            type="text"
            value={bannerUrl}
            onChange={(e) => setBannerUrl(e.target.value)}
            placeholder="https://ejemplo.com/banner.jpg"
            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-lg px-3.5 py-2.5 text-xs text-white outline-none transition"
          />
        </div>
      </div>
            </div>
            <SettingsCardFooter hint="El slug cambia el enlace de tu carta y de tus códigos QR.">
              <button type="submit" disabled={saving} className={primaryButtonClass}>
                {saving ? 'Guardando...' : 'Guardar identidad'}
              </button>
            </SettingsCardFooter>
          </form>
        )}

        {/* Perfil (ubicación y tema), Horarios y Pagos: un solo formulario que queda montado entre pestañas */}
        <RestaurantProfileSection view={activeTab} />

        {/* SEGURIDAD: 2FA, equipo de cocina e información de la cuenta */}
        {activeTab === 'seguridad' && (
          <>
            <TwoFactorSection />
            <TeamSection />
            <section className={settingsCardClass}>
              <SettingsCardHeader title="Información de la cuenta" />
              <dl className="grid grid-cols-1 gap-4 p-6 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500 font-medium">Correo del administrador</dt>
                  <dd className="text-white font-semibold mt-0.5">{ownerEmail}</dd>
                </div>
                <div>
                  <dt className="text-slate-500 font-medium">ID del restaurante (multi-tenant)</dt>
                  <dd className="text-emerald-400 font-mono mt-0.5 break-all">{restaurantId}</dd>
                </div>
              </dl>
            </section>
          </>
        )}
      </SettingsPanel>
    </div>
  );
}
