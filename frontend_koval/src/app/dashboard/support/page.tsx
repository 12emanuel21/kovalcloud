'use client';

import React, { useEffect, useState } from 'react';
import { ChevronDown, LifeBuoy, Plus, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { RESTAURANT_TIMEZONE } from '@/lib/business-hours';

const API_URL = typeof window !== 'undefined' ? '/api' : 'http://koval_backend:4000';

/** Deben coincidir con backend_koval/src/support/ticket-constants.ts */
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
type TicketStatus = (typeof STATUSES)[number];
type TicketPriority = (typeof PRIORITIES)[number];

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
}

const STATUS_STYLES: Record<TicketStatus, { label: string; className: string }> = {
  OPEN: { label: 'Abierto', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  IN_PROGRESS: { label: 'En progreso', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  RESOLVED: { label: 'Resuelto', className: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  CLOSED: { label: 'Cerrado', className: 'bg-slate-800 text-slate-500 border-slate-700' },
};

const PRIORITY_STYLES: Record<TicketPriority, { label: string; className: string }> = {
  LOW: { label: 'Baja', className: 'bg-slate-500/10 text-slate-400 border-slate-600/40' },
  NORMAL: { label: 'Normal', className: 'bg-sky-500/10 text-sky-300 border-sky-500/30' },
  HIGH: { label: 'Alta', className: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  URGENT: { label: 'Urgente', className: 'bg-rose-500/15 text-rose-300 border-rose-500/40' },
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', {
    timeZone: RESTAURANT_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const message = Array.isArray(data.message) ? data.message.join('. ') : data.message;
  return message || fallback;
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${className}`}>
      {children}
    </span>
  );
}

const fieldClass =
  'w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-sm text-white outline-none [color-scheme:dark]';

/**
 * Soporte interno: tickets del restaurante. Usa el restaurantId del contexto
 * (el del OWNER o el del local operado por el SUPERADMIN en Modo Dios).
 */
export default function SupportPage() {
  const { restaurantId, token } = useAuth();
  const ticketsUrl = restaurantId ? `${API_URL}/restaurants/${restaurantId}/tickets` : null;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('NORMAL');
  const [creating, setCreating] = useState(false);

  // Carga inicial: setState solo en callbacks de la promesa
  useEffect(() => {
    if (!ticketsUrl || !token) return;
    let cancelled = false;
    fetch(ticketsUrl, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudieron cargar los tickets'));
        return res.json() as Promise<Ticket[]>;
      })
      .then((data) => {
        if (!cancelled) setTickets(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar los tickets');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticketsUrl, token]);

  const resetForm = () => {
    setShowForm(false);
    setSubject('');
    setDescription('');
    setPriority('NORMAL');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketsUrl) return;
    if (!subject.trim() || !description.trim()) {
      setError('El asunto y la descripción son obligatorios');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(ticketsUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), description: description.trim(), priority }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo crear el ticket'));
      const created: Ticket = await res.json();
      setTickets((prev) => [created, ...prev]);
      setExpandedId(created.id);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el ticket');
    } finally {
      setCreating(false);
    }
  };

  const updateTicket = async (ticketId: string, changes: Partial<Pick<Ticket, 'status' | 'priority'>>) => {
    if (!ticketsUrl) return;
    setUpdatingId(ticketId);
    setError(null);
    try {
      const res = await fetch(`${ticketsUrl}/${ticketId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo actualizar el ticket'));
      const updated: Ticket = await res.json();
      setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el ticket');
    } finally {
      setUpdatingId(null);
    }
  };

  const openCount = tickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Tickets de soporte</h2>
          <p className="text-xs text-slate-500">
            {tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'} · {openCount} pendientes
          </p>
        </div>
        <button
          type="button"
          onClick={() => (showForm ? resetForm() : setShowForm(true))}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-950/40 transition hover:bg-emerald-500 cursor-pointer"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? 'Cancelar' : 'Nuevo Ticket'}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">{error}</div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl"
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <label className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Asunto</span>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={150}
                placeholder="Ej. El bot no responde a los clientes"
                className={fieldClass}
                required
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Prioridad</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                className={fieldClass}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_STYLES[p].label} ({p})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Descripción</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              rows={5}
              placeholder="Cuéntanos qué pasó, desde cuándo y cómo reproducirlo"
              className={`${fieldClass} resize-y`}
              required
            />
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-wait cursor-pointer"
            >
              {creating ? 'Creando...' : 'Crear ticket'}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80 shadow-xl">
        {loading ? (
          <p className="px-5 py-10 text-center text-xs text-slate-500">Cargando tickets...</p>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
            <LifeBuoy className="h-10 w-10 text-slate-700" />
            <p className="text-sm font-semibold text-slate-300">No hay tickets de soporte</p>
            <p className="text-xs text-slate-500">Si algo no funciona, crea un ticket y lo revisamos.</p>
          </div>
        ) : (
          <ul>
            {tickets.map((ticket) => {
              const expanded = expandedId === ticket.id;
              const busy = updatingId === ticket.id;
              return (
                <li key={ticket.id} className="border-b border-slate-800/60 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : ticket.id)}
                    aria-expanded={expanded}
                    className={`flex w-full items-center gap-3 px-5 py-4 text-left transition cursor-pointer ${
                      expanded ? 'bg-slate-800/40' : 'hover:bg-slate-800/30'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-semibold ${
                          ticket.status === 'CLOSED' ? 'text-slate-500 line-through' : 'text-white'
                        }`}
                      >
                        {ticket.subject}
                      </p>
                      <p className="text-[11px] text-slate-500">{formatDate(ticket.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                      <Badge className={PRIORITY_STYLES[ticket.priority]?.className ?? ''}>
                        {PRIORITY_STYLES[ticket.priority]?.label ?? ticket.priority}
                      </Badge>
                      <Badge className={STATUS_STYLES[ticket.status]?.className ?? ''}>
                        {STATUS_STYLES[ticket.status]?.label ?? ticket.status}
                      </Badge>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {expanded && (
                    <div className="space-y-4 bg-slate-950/40 px-5 pb-5 pt-3">
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300">
                        {ticket.description}
                      </p>
                      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                        <div className="flex flex-wrap gap-3">
                          <label className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Estado</span>
                            <select
                              value={ticket.status}
                              disabled={busy}
                              onChange={(e) => updateTicket(ticket.id, { status: e.target.value as TicketStatus })}
                              className={`${fieldClass} w-44 py-1.5 text-xs disabled:opacity-50`}
                            >
                              {STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {STATUS_STYLES[s].label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Prioridad</span>
                            <select
                              value={ticket.priority}
                              disabled={busy}
                              onChange={(e) => updateTicket(ticket.id, { priority: e.target.value as TicketPriority })}
                              className={`${fieldClass} w-36 py-1.5 text-xs disabled:opacity-50`}
                            >
                              {PRIORITIES.map((p) => (
                                <option key={p} value={p}>
                                  {PRIORITY_STYLES[p].label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <p className="text-[10px] text-slate-600">
                          {busy ? 'Guardando...' : `Actualizado: ${formatDate(ticket.updatedAt)}`}
                        </p>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
