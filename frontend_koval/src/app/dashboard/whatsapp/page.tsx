'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { QRCodeCanvas } from 'qrcode.react';

const API_URL = typeof window !== "undefined" ? "/api" : "http://koval_backend:4000";
const WHATSAPP_API_URL = 'http://localhost:5000';

type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED';

interface StatusResponse {
  service: string;
  status: ConnectionStatus;
  qr?: string | null;
  user?: { id?: string; name?: string } | null;
}

interface RestaurantData {
  id: string;
  name: string;
  slug: string;
  botpressBotId?: string | null;
  whatsappPhoneId?: string | null;
  whatsappToken?: string | null;
  whatsappWabaId?: string | null;
  whatsappVerifyToken?: string | null;
}

export default function WhatsAppDashboardPage() {
  const { restaurantId , token} = useAuth();

  // Selector de Pestaña Activa ('meta' | 'baileys')
  const [activeTab, setActiveTab] = useState<'meta' | 'baileys'>('meta');

  // --- ESTADOS: PESTAÑA META CLOUD API ---
  const [metaLoading, setMetaLoading] = useState<boolean>(true);
  const [metaSaving, setMetaSaving] = useState<boolean>(false);
  const [metaFeedback, setMetaFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [restaurantSlug, setRestaurantSlug] = useState<string>('');
  const [whatsappPhoneId, setWhatsappPhoneId] = useState<string>('');
  const [whatsappToken, setWhatsappToken] = useState<string>('');
  const [whatsappWabaId, setWhatsappWabaId] = useState<string>('');
  const [whatsappVerifyToken, setWhatsappVerifyToken] = useState<string>('');
  const [botpressBotId, setBotpressBotId] = useState<string>('koval-pizzeria-bot');

  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [copiedToken, setCopiedToken] = useState<boolean>(false);
  const [showToken, setShowToken] = useState<boolean>(false);

  // --- ESTADOS: PESTAÑA BAILEYS QR ---
  const [status, setStatus] = useState<ConnectionStatus>('DISCONNECTED');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [user, setUser] = useState<{ id?: string; name?: string } | null>(null);
  const [isServiceOnline, setIsServiceOnline] = useState<boolean>(true);
  const [baileysLoading, setBaileysLoading] = useState<boolean>(true);
  const [isDisconnecting, setIsDisconnecting] = useState<boolean>(false);
  const [testPhone, setTestPhone] = useState<string>('');
  const [testMessage, setTestMessage] = useState<string>('¡Hola! Este es un mensaje de prueba de Koval Cloud.');
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [testFeedback, setTestFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 1. Cargar datos del restaurante para Meta Cloud API
  const fetchMetaSettings = useCallback(async () => {
    if (!restaurantId) return;
    setMetaLoading(true);
    try {
      const res = await fetch(`${API_URL}/restaurants/${restaurantId}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('No se pudo cargar la configuración de WhatsApp');
      const data: RestaurantData = await res.json();
      setRestaurantSlug(data.slug || '');
      setWhatsappPhoneId(data.whatsappPhoneId || '');
      setWhatsappToken(data.whatsappToken || '');
      setWhatsappWabaId(data.whatsappWabaId || '');
      setWhatsappVerifyToken(data.whatsappVerifyToken || data.slug || data.id || '');
      setBotpressBotId(data.botpressBotId || 'koval-pizzeria-bot');
    } catch (err) {
      console.error(err);
      setMetaFeedback({ type: 'error', text: 'Error al cargar credenciales de Meta API.' });
    } finally {
      setMetaLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchMetaSettings();
  }, [fetchMetaSettings]);

  // URL del Webhook oficial
  const effectiveVerifyToken = whatsappVerifyToken.trim() || restaurantSlug.trim() || restaurantId || 'default';
  const webhookUrl = `https://kovalcloude.autobotsdev.dev/meta/webhook/${effectiveVerifyToken}`;

  // Copiar al portapapeles
  const handleCopy = (text: string, type: 'url' | 'token') => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2500);
    }
  };

  // Generar token aleatorio
  const handleGenerateRandomToken = () => {
    const randomToken = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `token_${Math.random().toString(36).substring(2, 12)}`;
    setWhatsappVerifyToken(randomToken);
  };
  // Guardar Cambios de Meta Cloud API
  const handleSaveMetaSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setMetaSaving(true);
    setMetaFeedback(null);

    try {
      const payload = {
        whatsappPhoneId: whatsappPhoneId.trim() || undefined,
        whatsappToken: whatsappToken.trim() || undefined,
        whatsappWabaId: whatsappWabaId.trim() || undefined,
        whatsappVerifyToken: whatsappVerifyToken.trim() || undefined,
        botpressBotId: botpressBotId.trim() || undefined,
      };

      const res = await fetch(`${API_URL}/restaurants/${restaurantId}`, {
        method: 'PATCH',
        headers: {
        'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Error al guardar credenciales');
      }

      setMetaFeedback({ type: 'success', text: '¡Credenciales de Meta Cloud API guardadas exitosamente!' });
      setTimeout(() => setMetaFeedback(null), 5000);
    } catch (err: unknown) {
      setMetaFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al actualizar configuración',
      });
    } finally {
      setMetaSaving(false);
    }
  };

  // 2. Consultar estado del microservicio Baileys
  const fetchBaileysStatus = useCallback(async () => {
    try {
      const res = await fetch(`${WHATSAPP_API_URL}/status`, {
        cache: 'no-store',
      });

      if (!res.ok) throw new Error(`Error: ${res.status}`);

      const data: StatusResponse = await res.json();
      setStatus(data.status);
      setQrCode(data.qr || null);
      setUser(data.user || null);
      setIsServiceOnline(true);
    } catch {
      setIsServiceOnline(false);
      setStatus('DISCONNECTED');
    } finally {
      setBaileysLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'baileys') {
      fetchBaileysStatus();
      const interval = setInterval(fetchBaileysStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [activeTab, fetchBaileysStatus]);

  const handleDisconnect = async () => {
    if (!confirm('¿Estás seguro de que deseas cerrar la sesión de WhatsApp Socket?')) return;
    setIsDisconnecting(true);
    try {
      await fetch(`${WHATSAPP_API_URL}/logout`, { method: 'POST' });
      await fetchBaileysStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleConnect = async () => {
    try {
      await fetch(`${WHATSAPP_API_URL}/connect`, { method: 'POST' });
      await fetchBaileysStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim() || !testMessage.trim()) return;

    setIsSendingTest(true);
    setTestFeedback(null);

    try {
      const res = await fetch(`${WHATSAPP_API_URL}/send`, {
        method: 'POST',
        headers: {
        'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone.trim(), message: testMessage.trim() }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al enviar mensaje');
      }

      setTestFeedback({ type: 'success', text: `¡Mensaje enviado correctamente a ${testPhone}!` });
      setTimeout(() => setTestFeedback(null), 5000);
    } catch (err: unknown) {
      setTestFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'No se pudo enviar el mensaje',
      });
    } finally {
      setIsSendingTest(false);
    }
  };
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Encabezado Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">
            Centro de Conexión WhatsApp
          </span>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mt-1">
            Conexión de Chatbot & WhatsApp
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Conecta tu línea oficial de Meta Cloud API o utiliza el emulador de WhatsApp Web por código QR.
          </p>
        </div>
      </div>

      {/* Selector de Pestañas */}
      <div className="flex items-center p-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl gap-2 backdrop-blur-sm max-w-md">
        <button
          type="button"
          onClick={() => setActiveTab('meta')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'meta'
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 shadow-md shadow-emerald-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <span>🌐 Meta Cloud API</span>
          <span className="text-[9px] bg-slate-950/40 text-slate-900 font-bold px-1.5 py-0.5 rounded">v22.0</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('baileys')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'baileys'
              ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-md shadow-purple-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <span>📱 WhatsApp Web QR</span>
        </button>
      </div>

      {/* PESTAÑA 1: META CLOUD API OFICIAL */}
      {activeTab === 'meta' && (
        <div className="space-y-6">
          {metaFeedback && (
            <div
              className={`p-4 rounded-2xl text-xs font-semibold flex items-center gap-3 animate-in fade-in duration-200 ${
                metaFeedback.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
              }`}
            >
              <span>{metaFeedback.type === 'success' ? '✓' : '⚠️'}</span>
              <span>{metaFeedback.text}</span>
            </div>
          )}

          {metaLoading ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center space-y-3">
              <svg className="animate-spin h-6 w-6 text-emerald-400 mx-auto" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="text-xs text-slate-400">Cargando credenciales oficiales de WhatsApp...</p>
            </div>
          ) : (
            <form onSubmit={handleSaveMetaSettings} className="space-y-6">
              {/* Tarjeta de Webhook */}
              <section className="bg-slate-900/90 border border-emerald-500/30 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl backdrop-blur-sm relative overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-lg border border-emerald-500/30">
                      🌐
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <span>Configuración de Webhook en Meta</span>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                          En Vivo
                        </span>
                      </h2>
                      <p className="text-xs text-slate-400">
                        Copia estos datos en tu App en Meta for Developers para recibir mensajes
                      </p>
                    </div>
                  </div>
                  <a
                    href="https://developers.facebook.com/apps"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 shrink-0"
                  >
                    <span>Meta Developers Portal</span>
                    <span className="font-mono">↗</span>
                  </a>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Callback URL */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-400">
                      Callback URL (URL del Webhook Oficial)
                    </label>
                    <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                      <span className="font-mono text-emerald-400 text-xs truncate flex-1 select-all" title={webhookUrl}>
                        {webhookUrl}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(webhookUrl, 'url')}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/20 transition shrink-0 cursor-pointer"
                      >
                        {copiedUrl ? '✓ Copiado' : 'Copiar'}
                      </button>
                    </div>
                  </div>

                  {/* Verify Token */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-slate-400">
                        Verify Token (Token de Verificación) <span className="text-emerald-400">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleGenerateRandomToken}
                        className="text-[10px] text-slate-400 hover:text-emerald-400 underline transition cursor-pointer"
                      >
                        Generar aleatorio
                      </button>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 focus-within:border-emerald-500 rounded-xl px-3 py-1.5 transition">
                      <input
                        type="text"
                        value={whatsappVerifyToken}
                        onChange={(e) => setWhatsappVerifyToken(e.target.value)}
                        placeholder="token_personalizado_123"
                        className="w-full bg-transparent font-mono text-emerald-400 text-xs outline-none py-1"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopy(effectiveVerifyToken, 'token')}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/20 transition shrink-0 cursor-pointer"
                      >
                        {copiedToken ? '✓ Copiado' : 'Copiar'}
                      </button>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500">
                  En el panel de Meta: ve a <strong>WhatsApp &gt; Configuration &gt; Webhook</strong>, pega estos valores y suscríbete al campo <code className="text-emerald-300 font-mono">messages</code>.
                </p>
              </section>

              {/* Tarjeta de Credenciales */}
              <section className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl backdrop-blur-sm">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>🔑 Credenciales de Acceso Meta Graph API</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Phone Number ID (Meta) <span className="text-emerald-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={whatsappPhoneId}
                      onChange={(e) => setWhatsappPhoneId(e.target.value)}
                      placeholder="Ej. 102938475610293"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-sm font-mono text-white placeholder-slate-600 outline-none transition"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      ID numérico del número de teléfono asignado en Meta Cloud API.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      WhatsApp Business Account ID (WABA ID)
                    </label>
                    <input
                      type="text"
                      value={whatsappWabaId}
                      onChange={(e) => setWhatsappWabaId(e.target.value)}
                      placeholder="Ej. 987654321098765"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-sm font-mono text-white placeholder-slate-600 outline-none transition"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Identificador de la cuenta de WhatsApp Business (opcional).
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-300">
                        Access Token Permanente de Meta (Bearer Token) <span className="text-emerald-400">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="text-[11px] text-slate-400 hover:text-white transition cursor-pointer"
                      >
                        {showToken ? '🙈 Ocultar Token' : '👁️ Mostrar Token'}
                      </button>
                    </div>
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={whatsappToken}
                      onChange={(e) => setWhatsappToken(e.target.value)}
                      placeholder="EAABwzLix..."
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-sm font-mono text-emerald-300 placeholder-slate-600 outline-none transition"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Token del Usuario del Sistema con permisos <code className="text-emerald-300 font-mono">whatsapp_business_messaging</code> y <code className="text-emerald-300 font-mono">whatsapp_business_management</code>.
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Botpress Bot ID <span className="text-purple-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={botpressBotId}
                      onChange={(e) => setBotpressBotId(e.target.value)}
                      placeholder="koval-pizzeria-bot"
                      required
                      className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-3.5 py-2.5 text-sm font-mono text-purple-300 outline-none transition"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Identificador del bot en Botpress v12 que procesará los mensajes entrantes.
                    </p>
                  </div>
                </div>
              </section>

              {/* Botón Guardar */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={metaSaving}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-sm transition shadow-lg shadow-emerald-500/20 active:scale-98 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {metaSaving ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-slate-950" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Guardando Cambios...</span>
                    </>
                  ) : (
                    <>
                      <span>💾 Guardar Configuración Oficial</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
      {/* PESTAÑA 2: BAILEYS WHATSAPP WEB QR */}
      {activeTab === 'baileys' && (
        <div className="space-y-6">
          {/* Banner de Estado */}
          <div className="flex items-center justify-between p-4 bg-slate-900/60 border border-slate-800 rounded-2xl">
            <div className="flex items-center gap-3">
              <span
                className={`h-3 w-3 rounded-full ${
                  !isServiceOnline
                    ? 'bg-rose-500'
                    : status === 'CONNECTED'
                    ? 'bg-emerald-500 animate-pulse'
                    : status === 'QR_READY'
                    ? 'bg-amber-500 animate-ping'
                    : 'bg-slate-500'
                }`}
              />
              <div>
                <span className="text-xs font-bold text-white">
                  Estado Socket Local:{' '}
                  <span className="text-slate-300">
                    {!isServiceOnline
                      ? 'Servicio Offline (Puerto 5000)'
                      : status === 'CONNECTED'
                      ? 'Conectado a WhatsApp'
                      : status === 'QR_READY'
                      ? 'Esperando Escaneo QR'
                      : 'Iniciando / Reconectando'}
                  </span>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchBaileysStatus}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Actualizar Estado
              </button>
            </div>
          </div>

          {!isServiceOnline && (
            <div className="p-6 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-rose-300 space-y-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>⚠️ Microservicio Local Offline</span>
              </h3>
              <p className="text-xs text-rose-300/90 leading-relaxed">
                El gateway local de WhatsApp (<code className="font-mono text-rose-200">whatsapp_service</code>) no está respondiendo en el puerto 5000. Para iniciarlo ejecuta en la terminal:
              </p>
              <div className="bg-slate-950 p-3 rounded-xl border border-rose-500/20 font-mono text-xs text-emerald-400">
                cd whatsapp_service && npm run dev
              </div>
            </div>
          )}

          {isServiceOnline && status === 'CONNECTED' && (
            <div className="bg-slate-900/80 border border-emerald-500/30 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xl border border-emerald-500/20">
                    ✓
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Sesión Activa</h3>
                    <p className="text-xs text-slate-400">
                      Usuario conectado: <strong className="text-emerald-400">{user?.name || user?.id || 'Bot Koval'}</strong>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-bold rounded-xl transition disabled:opacity-50 cursor-pointer"
                >
                  {isDisconnecting ? 'Cerrando sesión...' : 'Cerrar Sesión WhatsApp'}
                </button>
              </div>

              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold text-slate-300">📤 Probar Envío desde Socket Local</h4>
                {testFeedback && (
                  <div
                    className={`p-3 rounded-xl text-xs font-medium ${
                      testFeedback.type === 'success'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}
                  >
                    {testFeedback.text}
                  </div>
                )}
                <form onSubmit={handleSendTestMessage} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1 font-medium">
                      Teléfono Destino (con indicativo)
                    </label>
                    <input
                      type="text"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      placeholder="573001234567"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1 font-medium">
                      Mensaje de Prueba
                    </label>
                    <input
                      type="text"
                      value={testMessage}
                      onChange={(e) => setTestMessage(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-white outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSendingTest}
                    className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold py-2.5 px-4 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isSendingTest ? 'Enviando...' : 'Enviar Prueba'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {isServiceOnline && status === 'QR_READY' && qrCode && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-6">
                <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl">
                  <div>
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                      Paso a Paso
                    </span>
                    <h2 className="text-xl font-black text-white mt-1">
                      Cómo vincular tu WhatsApp
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Abre WhatsApp en tu teléfono celular y escanea el código:
                    </p>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                      <div className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-400 font-bold flex items-center justify-center border border-emerald-500/20 shrink-0">
                        1
                      </div>
                      <div>
                        <h4 className="font-bold text-white">Abre WhatsApp</h4>
                        <p className="text-slate-400">Toca los 3 puntos (Android) o Configuración (iPhone).</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                      <div className="h-7 w-7 rounded-lg bg-blue-500/10 text-blue-400 font-bold flex items-center justify-center border border-blue-500/20 shrink-0">
                        2
                      </div>
                      <div>
                        <h4 className="font-bold text-white">Dispositivos Vinculados</h4>
                        <p className="text-slate-400">Selecciona "Dispositivos vinculados" &gt; "Vincular dispositivo".</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                      <div className="h-7 w-7 rounded-lg bg-purple-500/10 text-purple-400 font-bold flex items-center justify-center border border-purple-500/20 shrink-0">
                        3
                      </div>
                      <div>
                        <h4 className="font-bold text-white">Escanea el Código QR</h4>
                        <p className="text-slate-400">Apunta la cámara al código QR de la derecha.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 flex flex-col items-center">
                <div className="bg-white rounded-3xl p-6 shadow-2xl border-4 border-slate-200 text-center space-y-4 max-w-sm w-full">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                      Escaneo en Vivo
                    </span>
                    <h3 className="text-base font-black text-slate-900">
                      Vincular WhatsApp Socket
                    </h3>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-2xl inline-block border border-slate-200 shadow-inner">
                    <QRCodeCanvas
                      value={qrCode}
                      size={240}
                      bgColor="#ffffff"
                      fgColor="#0f172a"
                      level="M"
                      includeMargin={false}
                    />
                  </div>

                  <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-500">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                    <span>Actualizando sesión en tiempo real...</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isServiceOnline && status !== 'CONNECTED' && status !== 'QR_READY' && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-10 text-center space-y-4 max-w-xl mx-auto">
              <div className="h-14 w-14 mx-auto rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400">
                <svg className="animate-spin h-6 w-6 text-emerald-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">Iniciando sesión de WhatsApp Socket...</h3>
                <p className="text-xs text-slate-400">
                  El código QR aparecerá automáticamente en breve.
                </p>
              </div>
              <button
                type="button"
                onClick={handleConnect}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Forzar Inicialización
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}