'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LifeBuoy, LogIn, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  TICKET_PRIORITIES,
  TICKET_PRIORITY_STYLES,
  TICKET_STATUSES,
  TICKET_STATUS_STYLES,
  formatTicketDate,
  isTicketPending,
  type AdminSupportTicket,
  type SupportTicket,
  type TicketPriority,
  type TicketStatus,
} from '@/lib/support-tickets';
import { TicketPriorityBadge, TicketStatusBadge } from '@/components/support/TicketBadges';

const API_URL = '/api';

type StatusFilter = 'PENDING' | 'ALL' | TicketStatus;

async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const message = Array.isArray(data.message) ? data.message.join('. ') : data.message;
  return message || fallback;
}

const selectClass =
  'rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-violet-500 disabled:opacity-50 [color-scheme:dark]';

/**
 * Soporte Global: tickets de todos los restaurantes (GET /admin/tickets, solo SUPERADMIN).
 * Los cambios reutilizan PATCH /restaurants/:id/tickets/:ticketId con el restaurante del ticket.
 */
export default function AdminTicketsPage() {
  const { token, enterAsOwner } = useAuth();
  const router = useRouter();

  const [tickets, setTickets] = useState<AdminSupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('PENDING');

  const fetchTickets = useCallback(async (): Promise<AdminSupportTicket[]> => {
    const res = await fetch(`${API_URL}/admin/tickets`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudieron cargar los tickets'));
    return res.json();
  }, [token]);

  // Carga inicial: setState solo en callbacks de la promesa
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchTickets()
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
  }, [token, fetchTickets]);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      setTickets(await fetchTickets());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los tickets');
    } finally {
      setLoading(false);
    }
  };

  const updateTicket = async (
    ticket: AdminSupportTicket,
    changes: Partial<Pick<SupportTicket, 'status' | 'priority'>>,
  ) => {
    setUpdatingId(ticket.id);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/restaurants/${ticket.restaurant.id}/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo actualizar el ticket'));
      const updated: SupportTicket = await res.json();
      // El PATCH no incluye el restaurante: se conserva el que ya teníamos
      setTickets((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el ticket');
    } finally {
      setUpdatingId(null);
    }
  };

  // Modo Dios directo al panel de soporte del local
  const openAsOwner = (ticket: AdminSupportTicket) => {
    enterAsOwner(ticket.restaurant);
    router.push('/dashboard/support');
  };

  const pendingCount = tickets.filter(isTicketPending).length;
  const urgentCount = tickets.filter((t) => isTicketPending(t) && t.priority === 'URGENT').length;
  const visible = tickets.filter((t) =>
    filter === 'ALL' ? true : filter === 'PENDING' ? isTicketPending(t) : t.status === filter,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white md:text-3xl">Soporte Global</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {tickets.length} tickets en la plataforma · {pendingCount} pendientes
            {urgentCount > 0 && <span className="font-semibold text-rose-400"> · {urgentCount} urgentes</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as StatusFilter)}
            aria-label="Filtrar por estado"
            className={`${selectClass} py-2.5 text-sm`}
          >
            <option value="PENDING">Pendientes</option>
            <option value="ALL">Todos</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TICKET_STATUS_STYLES[s].label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2.5 text-sm text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
            aria-label="Recargar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/60">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Restaurante</th>
              <th className="px-4 py-3 font-semibold">Asunto</th>
              <th className="px-4 py-3 font-semibold">Fecha</th>
              <th className="px-4 py-3 font-semibold">Prioridad</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && tickets.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-xs text-zinc-500">
                  Cargando tickets...
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-14 text-center">
                  <LifeBuoy className="mx-auto mb-2 h-10 w-10 text-zinc-700" />
                  <p className="text-sm font-semibold text-zinc-300">
                    {tickets.length === 0 ? 'Ningún restaurante ha abierto tickets' : 'No hay tickets con este filtro'}
                  </p>
                </td>
              </tr>
            ) : (
              visible.map((ticket) => {
                const expanded = expandedId === ticket.id;
                const busy = updatingId === ticket.id;
                return (
                  <React.Fragment key={ticket.id}>
                    <tr
                      onClick={() => setExpandedId(expanded ? null : ticket.id)}
                      aria-expanded={expanded}
                      className={`cursor-pointer border-b border-zinc-800/60 transition ${
                        expanded ? 'bg-zinc-800/50' : 'hover:bg-zinc-800/30'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-white">{ticket.restaurant.name}</p>
                        <p className="text-[11px] text-zinc-500">/{ticket.restaurant.slug}</p>
                      </td>
                      <td
                        className={`max-w-xs truncate px-4 py-3 ${
                          ticket.status === 'CLOSED' ? 'text-zinc-500 line-through' : 'text-zinc-200'
                        }`}
                      >
                        {ticket.subject}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-400">
                        {formatTicketDate(ticket.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <TicketPriorityBadge priority={ticket.priority} />
                      </td>
                      <td className="px-4 py-3">
                        <TicketStatusBadge status={ticket.status} />
                      </td>
                      <td className="px-4 py-3">
                        <ChevronDown
                          className={`h-4 w-4 text-zinc-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
                        />
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-zinc-800/60 bg-zinc-950/50">
                        <td colSpan={6} className="space-y-4 px-4 pb-5 pt-3">
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-300">
                            {ticket.description}
                          </p>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div className="flex flex-wrap items-end gap-3">
                              <label className="space-y-1">
                                <span className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                                  Estado
                                </span>
                                <select
                                  value={ticket.status}
                                  disabled={busy}
                                  onChange={(e) => updateTicket(ticket, { status: e.target.value as TicketStatus })}
                                  className={`${selectClass} w-40`}
                                >
                                  {TICKET_STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {TICKET_STATUS_STYLES[s].label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="space-y-1">
                                <span className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                                  Prioridad
                                </span>
                                <select
                                  value={ticket.priority}
                                  disabled={busy}
                                  onChange={(e) =>
                                    updateTicket(ticket, { priority: e.target.value as TicketPriority })
                                  }
                                  className={`${selectClass} w-36`}
                                >
                                  {TICKET_PRIORITIES.map((p) => (
                                    <option key={p} value={p}>
                                      {TICKET_PRIORITY_STYLES[p].label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                type="button"
                                onClick={() => openAsOwner(ticket)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-semibold text-orange-300 transition hover:bg-orange-500/20"
                              >
                                <LogIn className="h-3.5 w-3.5" />
                                Entrar como Dueño
                              </button>
                            </div>
                            <p className="text-[10px] text-zinc-600">
                              {busy ? 'Guardando...' : `Actualizado: ${formatTicketDate(ticket.updatedAt)}`}
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
