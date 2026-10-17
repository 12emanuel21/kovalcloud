import React from 'react';
import {
  TICKET_PRIORITY_STYLES,
  TICKET_STATUS_STYLES,
  type TicketPriority,
  type TicketStatus,
} from '@/lib/support-tickets';

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${className}`}
    >
      {children}
    </span>
  );
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const style = TICKET_STATUS_STYLES[status];
  return <Badge className={style?.className ?? ''}>{style?.label ?? status}</Badge>;
}

export function TicketPriorityBadge({ priority }: { priority: TicketPriority }) {
  const style = TICKET_PRIORITY_STYLES[priority];
  return <Badge className={style?.className ?? ''}>{style?.label ?? priority}</Badge>;
}
