import { RESTAURANT_TIMEZONE } from '@/lib/business-hours';

/** Deben coincidir con backend_koval/src/support/ticket-constants.ts */
export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export interface SupportTicket {
  id: string;
  restaurantId: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
}

/** Ticket del panel global (GET /admin/tickets incluye el restaurante) */
export interface AdminSupportTicket extends SupportTicket {
  restaurant: { id: string; name: string; slug: string };
}

export const TICKET_STATUS_STYLES: Record<TicketStatus, { label: string; className: string }> = {
  OPEN: { label: 'Abierto', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  IN_PROGRESS: { label: 'En progreso', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  RESOLVED: { label: 'Resuelto', className: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  CLOSED: { label: 'Cerrado', className: 'bg-slate-800 text-slate-500 border-slate-700' },
};

export const TICKET_PRIORITY_STYLES: Record<TicketPriority, { label: string; className: string }> = {
  LOW: { label: 'Baja', className: 'bg-slate-500/10 text-slate-400 border-slate-600/40' },
  NORMAL: { label: 'Normal', className: 'bg-sky-500/10 text-sky-300 border-sky-500/30' },
  HIGH: { label: 'Alta', className: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  URGENT: { label: 'Urgente', className: 'bg-rose-500/15 text-rose-300 border-rose-500/40' },
};

export const isTicketPending = (ticket: { status: TicketStatus }) =>
  ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS';

export const formatTicketDate = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', {
    timeZone: RESTAURANT_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
