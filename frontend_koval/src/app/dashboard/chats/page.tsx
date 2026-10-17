'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bot, MessagesSquare, RefreshCw, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { RESTAURANT_TIMEZONE } from '@/lib/business-hours';

const API_URL = typeof window !== 'undefined' ? '/api' : 'http://koval_backend:4000';

/** Cada cuánto se refrescan la bandeja y el chat abierto */
const POLL_INTERVAL_MS = 10_000;

/** Marcadores internos del bot (role "system", ver backend chats/chat-history.ts) */
const SYSTEM_LABELS: Record<string, string> = {
  '[SYSTEM_RESET_CONTEXT]': '🧹 El cliente reinició el contexto del bot',
};
const systemLabel = (message: string) => SYSTEM_LABELS[message] ?? `⚙️ ${message}`;

interface Conversation {
  customerPhone: string;
  lastMessage: string;
  lastRole: string; // "user" (cliente) | "model" (bot) | "system" (marcador interno)
  lastMessageAt: string;
  messageCount: number;
}

interface ChatMessage {
  id: string;
  role: string;
  message: string;
  createdAt: string;
}

async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const message = Array.isArray(data.message) ? data.message.join('. ') : data.message;
  return message || fallback;
}

/** "573107382726" -> "+57 310 738 2726" (números colombianos); otros: "+<dígitos>" */
function formatPhone(phone: string): string {
  const co = /^57(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return co ? `+57 ${co[1]} ${co[2]} ${co[3]}` : `+${phone}`;
}

const localDay = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: RESTAURANT_TIMEZONE });

/** Hora si es de hoy, "Ayer", o fecha corta (en la zona del local) */
function formatListDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (localDay(date) === localDay(now)) {
    return date.toLocaleTimeString('es-CO', { timeZone: RESTAURANT_TIMEZONE, hour: 'numeric', minute: '2-digit' });
  }
  if (localDay(date) === localDay(yesterday)) return 'Ayer';
  return date.toLocaleDateString('es-CO', { timeZone: RESTAURANT_TIMEZONE, day: '2-digit', month: 'short' });
}

const formatBubbleTime = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', {
    timeZone: RESTAURANT_TIMEZONE,
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

/**
 * Inbox de WhatsApp: historial de conversaciones del bot (ChatHistory).
 * Usa el restaurantId del contexto: el del OWNER o el del local operado en Modo Dios.
 */
export default function ChatsPage() {
  const { restaurantId, token } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const chatsUrl = restaurantId ? `${API_URL}/restaurants/${restaurantId}/chats` : null;

  const fetchJson = useCallback(
    async <T,>(url: string, fallback: string): Promise<T> => {
      const res = await fetch(url, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await apiErrorMessage(res, fallback));
      return res.json() as Promise<T>;
    },
    [token],
  );

  // Bandeja: carga inicial + refresco periódico (setState solo en callbacks)
  useEffect(() => {
    if (!chatsUrl || !token) return;
    let cancelled = false;
    const load = () =>
      fetchJson<Conversation[]>(chatsUrl, 'No se pudieron cargar los chats')
        .then((data) => {
          if (!cancelled) {
            setConversations(data);
            setError(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar los chats');
        })
        .finally(() => {
          if (!cancelled) setListLoading(false);
        });
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chatsUrl, token, fetchJson]);

  // Chat abierto: refresco periódico de sus mensajes
  useEffect(() => {
    if (!chatsUrl || !selectedPhone) return;
    let cancelled = false;
    const interval = setInterval(() => {
      fetchJson<ChatMessage[]>(`${chatsUrl}/${selectedPhone}`, 'No se pudo actualizar el chat')
        .then((data) => {
          if (!cancelled) setMessages(data);
        })
        .catch(() => {
          // El siguiente ciclo lo reintenta; el error de carga inicial ya se muestra
        });
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chatsUrl, selectedPhone, fetchJson]);

  // Al abrir o recibir mensajes, bajar al último
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const openConversation = async (phone: string) => {
    if (!chatsUrl) return;
    setSelectedPhone(phone);
    setMessages([]);
    setChatLoading(true);
    try {
      setMessages(await fetchJson<ChatMessage[]>(`${chatsUrl}/${phone}`, 'No se pudo cargar el chat'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el chat');
    } finally {
      setChatLoading(false);
    }
  };

  const refreshList = async () => {
    if (!chatsUrl) return;
    try {
      setConversations(await fetchJson<Conversation[]>(chatsUrl, 'No se pudieron cargar los chats'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los chats');
    }
  };

  const selected = conversations.find((c) => c.customerPhone === selectedPhone);

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">{error}</div>
      )}

      <div className="flex h-[calc(100vh-11rem)] min-h-[480px] overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80 shadow-xl">
        {/* Panel izquierdo: conversaciones */}
        <aside
          className={`w-full md:w-80 lg:w-96 shrink-0 flex-col border-r border-slate-800 ${
            selectedPhone ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3.5">
            <div>
              <h2 className="text-sm font-bold text-white">Conversaciones</h2>
              <p className="text-[11px] text-slate-500">
                {conversations.length} {conversations.length === 1 ? 'cliente' : 'clientes'} · se actualiza solo
              </p>
            </div>
            <button
              type="button"
              onClick={refreshList}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
              aria-label="Actualizar conversaciones"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {listLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2 border-b border-slate-800/60 px-4 py-3.5">
                  <div className="h-3 w-1/2 animate-pulse rounded bg-slate-800" />
                  <div className="h-3 w-4/5 animate-pulse rounded bg-slate-800/70" />
                </div>
              ))
            ) : conversations.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
                <MessagesSquare className="h-8 w-8 text-slate-600" />
                <p className="text-sm font-semibold text-slate-300">Aún no hay conversaciones</p>
                <p className="text-xs text-slate-500">Aparecerán aquí cuando los clientes escriban al WhatsApp del local.</p>
              </div>
            ) : (
              conversations.map((conversation) => {
                const active = conversation.customerPhone === selectedPhone;
                return (
                  <button
                    key={conversation.customerPhone}
                    type="button"
                    onClick={() => openConversation(conversation.customerPhone)}
                    className={`block w-full border-b border-slate-800/60 px-4 py-3.5 text-left transition ${
                      active ? 'bg-emerald-500/10' : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-sm font-semibold ${active ? 'text-emerald-300' : 'text-white'}`}>
                        {formatPhone(conversation.customerPhone)}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-500">{formatListDate(conversation.lastMessageAt)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">
                      {conversation.lastRole === 'model' && <span className="text-emerald-400/80">🤖 </span>}
                      {conversation.lastRole === 'system' ? systemLabel(conversation.lastMessage) : conversation.lastMessage}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Panel derecho: historial */}
        <section className={`min-w-0 flex-1 flex-col ${selectedPhone ? 'flex' : 'hidden md:flex'}`}>
          {!selectedPhone ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-emerald-500/20 bg-emerald-500/10">
                <MessagesSquare className="h-8 w-8 text-emerald-400" />
              </div>
              <h3 className="text-base font-bold text-white">Selecciona un chat para ver el historial</h3>
              <p className="max-w-sm text-xs text-slate-500">
                Aquí verás la conversación entre el cliente y el bot de WhatsApp, mensaje por mensaje.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setSelectedPhone(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 md:hidden"
                  aria-label="Volver a las conversaciones"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-300">
                  <User className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{formatPhone(selectedPhone)}</p>
                  <p className="text-[11px] text-slate-500">
                    {selected ? `${selected.messageCount} mensajes` : 'Historial del chat'}
                  </p>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto bg-slate-950/50 px-4 py-5">
                {chatLoading ? (
                  <p className="text-center text-xs text-slate-500">Cargando historial...</p>
                ) : messages.length === 0 ? (
                  <p className="text-center text-xs text-slate-500">Este chat no tiene mensajes guardados.</p>
                ) : (
                  messages.map((msg) => {
                    if (msg.role === 'system') {
                      return (
                        <div key={msg.id} className="flex justify-center">
                          <span className="rounded-full border border-slate-700/60 bg-slate-900 px-3 py-1 text-[10px] font-semibold text-slate-400">
                            {systemLabel(msg.message)} · {formatBubbleTime(msg.createdAt)}
                          </span>
                        </div>
                      );
                    }
                    const fromBot = msg.role === 'model';
                    return (
                      <div key={msg.id} className={`flex ${fromBot ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-3.5 py-2 shadow-sm ${
                            fromBot
                              ? 'rounded-br-md bg-emerald-600/90 text-white'
                              : 'rounded-bl-md border border-slate-700/60 bg-slate-800 text-slate-100'
                          }`}
                        >
                          <p
                            className={`mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${
                              fromBot ? 'text-emerald-100/80' : 'text-slate-400'
                            }`}
                          >
                            {fromBot ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                            {fromBot ? 'Bot' : 'Cliente'}
                          </p>
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{msg.message}</p>
                          <p className={`mt-1 text-right text-[10px] ${fromBot ? 'text-emerald-100/70' : 'text-slate-500'}`}>
                            {formatBubbleTime(msg.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
