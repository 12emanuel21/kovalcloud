'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import Image from 'next/image';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'SUPERADMIN' | 'RESTAURANT_OWNER' | 'SUPERVISOR' | 'STAFF';
  status: 'ACTIVE' | 'INVITED';
}

export default function SettingsPage() {
  const { restaurantId , token} = useAuth();

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

  // Estado del Módulo de Equipo
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteRole, setInviteRole] = useState<'SUPERVISOR' | 'STAFF'>('STAFF');
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  
  // 2FA States
  const [twoFactorStatus, setTwoFactorStatus] = useState<'disabled' | 'generating' | 'pending_verification' | 'enabled'>('disabled');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');

  const generate2FA = async () => {
    setTwoFactorStatus('generating');
    try {
      const res = await fetch(`${API_URL}/auth/2fa/generate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al generar 2FA');
      const data = await res.json();
      setQrCodeDataUrl(data.qrCodeUrl);
      setTwoFactorStatus('pending_verification');
    } catch (err) {
      setFeedback({ type: 'error', text: 'Error generando 2FA' });
      setTwoFactorStatus('disabled');
    }
  };

  const verify2FA = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/2fa/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code: verificationCode })
      });
      if (!res.ok) {
        throw new Error('Código inválido');
      }
      setTwoFactorStatus('enabled');
      setFeedback({ type: 'success', text: '2FA habilitado con éxito' });
    } catch (err) {
      setFeedback({ type: 'error', text: 'Código 2FA incorrecto' });
    }
  };

  // Cargar datos actuales del restaurante
  const fetchRestaurantSettings = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/restaurants/${restaurantId}`, {
        cache: 'no-store',
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

      // Inicializar lista de equipo con el dueño
      setTeamMembers([
        {
          id: '1',
          name: 'Propietario Principal',
          email: email,
          role: 'RESTAURANT_OWNER',
          status: 'ACTIVE',
        },
        {
          id: '2',
          name: 'Supervisor de Turno',
          email: 'supervisor@pizzeria.com',
          role: 'SUPERVISOR',
          status: 'ACTIVE',
        },
        {
          id: '3',
          name: 'Cajero / Mesero',
          email: 'caja@pizzeria.com',
          role: 'STAFF',
          status: 'ACTIVE',
        },
      ]);
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', text: 'Error al conectar con la API de configuración.' });
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

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

      const res = await fetch(`${API_URL}/restaurants/${restaurantId}`, {
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

  // Simular invitación de miembro
  const handleInviteMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    const newMember: TeamMember = {
      id: String(Date.now()),
      name: inviteEmail.split('@')[0],
      email: inviteEmail.trim(),
      role: inviteRole,
      status: 'INVITED',
    };

    setTeamMembers((prev) => [...prev, newMember]);
    setInviteEmail('');
    setShowInviteModal(false);
    setFeedback({ type: 'success', text: `Invitación enviada a ${newMember.email}` });
    setTimeout(() => setFeedback(null), 4000);
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
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Encabezado Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">
            Ajustes de Marca & Administración
          </span>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mt-1">
            Configuración del Restaurante
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Administra los datos de tu marca, menú digital y gestiona los roles de tu equipo.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {planName}
          </span>
        </div>
      </div>

      {/* Banner de Acceso Rápido a WhatsApp */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-emerald-950/40 via-slate-900/80 to-slate-900/80 border border-emerald-500/20 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-lg border border-emerald-500/20">
            💬
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">¿Deseas conectar tu Chatbot o WhatsApp?</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Configura tu línea oficial de Meta Cloud API v22.0 o el emulador de WhatsApp Web en el centro de conexiones.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/whatsapp"
          className="px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition flex items-center gap-1.5 shrink-0"
        >
          <span>Ir a Conexión WhatsApp</span>
          <span className="font-mono">→</span>
        </Link>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-2xl text-xs font-semibold flex items-center gap-3 animate-in fade-in duration-200 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
          }`}
        >
          <span>{feedback.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{feedback.text}</span>
        </div>
      )}

      {/* SECCIÓN 1: FORMULARIO DE IDENTIDAD DE MARCA */}
      <form onSubmit={handleSaveSettings} className="space-y-8">
        <section className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl backdrop-blur-sm">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-sm border border-emerald-500/20">
              🏪
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Identidad de Marca & Menú Digital</h2>
              <p className="text-xs text-slate-400">Datos públicos de tu local comercial</p>
            </div>
          </div>

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
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none transition"
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
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-sm font-mono text-emerald-400 outline-none transition"
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
                Teléfono Comercial / Atención
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej. +57 300 123 4567"
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Moneda de Operación
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none transition"
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
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none transition resize-none"
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
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none transition"
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
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none transition"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-sm transition shadow-lg shadow-emerald-500/20 active:scale-98 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {saving ? 'Guardando...' : '💾 Guardar Datos del Restaurante'}
            </button>
          </div>
        </section>
      </form>
      {/* SECCIÓN 2: GESTIÓN DE EQUIPO & ROLES */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-sm border border-blue-500/20">
              👥
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Gestión de Equipo & Roles</h2>
              <p className="text-xs text-slate-400">Control de accesos y permisos para administradores, supervisores y personal</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowInviteModal(!showInviteModal)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-blue-500/20 cursor-pointer self-start sm:self-auto"
          >
            <span>+ Invitar Miembro</span>
          </button>
        </div>

        {/* Modal/Formulario de Invitación */}
        {showInviteModal && (
          <form onSubmit={handleInviteMember} className="p-4 rounded-2xl bg-slate-950/80 border border-blue-500/30 space-y-4 animate-in fade-in duration-200">
            <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider">
              Invitar Nuevo Usuario al Local
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colaborador@restaurante.com"
                  required
                  className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Rol Asignado
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                >
                  <option value="SUPERVISOR">Supervisor / Cajero</option>
                  <option value="STAFF">Mesero / Empleado</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition cursor-pointer"
              >
                Enviar Invitación
              </button>
            </div>
          </form>
        )}

        {/* Lista de Miembros */}
        <div className="space-y-3">
          <div className="overflow-hidden border border-slate-800/80 rounded-2xl bg-slate-950/40">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="p-3.5 font-semibold">Usuario / Nombre</th>
                  <th className="p-3.5 font-semibold">Correo</th>
                  <th className="p-3.5 font-semibold">Rol</th>
                  <th className="p-3.5 font-semibold text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {teamMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-900/40 transition">
                    <td className="p-3.5 font-medium text-white flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs uppercase">
                        {member.name.charAt(0)}
                      </div>
                      <span>{member.name}</span>
                    </td>
                    <td className="p-3.5 text-slate-400 font-mono text-[11px]">{member.email}</td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          member.role === 'RESTAURANT_OWNER'
                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                            : member.role === 'SUPERVISOR'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        }`}
                      >
                        {member.role === 'RESTAURANT_OWNER'
                          ? '👑 Dueño / Admin'
                          : member.role === 'SUPERVISOR'
                          ? '⚡ Supervisor'
                          : '👨‍🍳 Empleado'}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                          member.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}
                      >
                        {member.status === 'ACTIVE' ? 'Activo' : 'Pendiente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Guía de Permisos */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1">
            <span className="text-[11px] font-bold text-purple-400 flex items-center gap-1">
              <span>👑 Dueño / Admin</span>
            </span>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Acceso total a finanzas, facturación, WhatsApp, Botpress y administración de usuarios.
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1">
            <span className="text-[11px] font-bold text-blue-400 flex items-center gap-1">
              <span>⚡ Supervisor</span>
            </span>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Gestión de pedidos en vivo, actualización de precios, productos agotados y reportes diarios.
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1">
            <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
              <span>👨‍🍳 Empleado / Mesero</span>
            </span>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Visualización de comandas en cocina, cambio de estados de pedidos y confirmación de entregas.
            </p>
          </div>
        </div>
      </section>

      {/* SECCIÓN 3: INFORMACIÓN DE LA CUENTA */}
      <section className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Información de la Cuenta
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-slate-500 font-medium">Correo del Administrador:</span>
            <p className="text-white font-semibold mt-0.5">{ownerEmail}</p>
          </div>
          <div>
            <span className="text-slate-500 font-medium">ID del Restaurante (Multi-Tenant):</span>
            <p className="text-emerald-400 font-mono mt-0.5">{restaurantId}</p>
          </div>
        </div>
      </section>

      {/* SECCIÓN 4: SEGURIDAD Y 2FA */}
      <section className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Seguridad de la Cuenta (2FA)
        </h3>
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Protege tu cuenta activando la Autenticación de Dos Factores (TOTP) usando Google Authenticator o Authy.
          </p>

          {twoFactorStatus === 'disabled' && (
            <button
              onClick={generate2FA}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition"
            >
              Habilitar 2FA
            </button>
          )}

          {twoFactorStatus === 'generating' && (
            <p className="text-xs text-slate-400">Generando código QR...</p>
          )}

          {twoFactorStatus === 'pending_verification' && qrCodeDataUrl && (
            <div className="space-y-4 bg-slate-950 p-4 rounded-xl border border-slate-800/80">
              <p className="text-xs font-semibold text-white">1. Escanea este código QR con tu app de autenticación:</p>
              <div className="bg-white p-2 w-max rounded-lg">
                <Image src={qrCodeDataUrl} alt="QR Code 2FA" width={150} height={150} />
              </div>
              <p className="text-xs font-semibold text-white">2. Ingresa el código de 6 dígitos:</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  className="bg-slate-900 border border-slate-700 px-3 py-2 rounded-lg text-white font-mono tracking-widest text-center w-32 outline-none focus:border-indigo-500"
                  placeholder="000000"
                />
                <button
                  onClick={verify2FA}
                  disabled={verificationCode.length !== 6}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition"
                >
                  Verificar y Activar
                </button>
              </div>
            </div>
          )}

          {twoFactorStatus === 'enabled' && (
            <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 rounded-xl">
              <span className="font-bold text-lg">✓</span>
              <span className="text-xs font-bold uppercase tracking-wider">Autenticación de 2 Factores (2FA) Activada</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}