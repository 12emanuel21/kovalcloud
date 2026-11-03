'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileText, Loader2, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChatMediaUrl } from '@/components/chats/ChatMedia';
import { orderNumberLabel } from '@/lib/order-number';

export interface ProofOrder {
  id: string;
  restaurantId: string;
  dailyNumber?: number | null;
  customerName: string;
  total: number | null;
  paymentStatus?: string;
  paymentProofUrl?: string | null;
  paymentProofAt?: string | null;
}

/** Lo que cambia en el pedido al confirmar el pago */
export interface ConfirmedPayment {
  id: string;
  paymentStatus: string;
  paymentMethod: string | null;
}

/**
 * Comprobante de pago que el cliente envió por WhatsApp (Nequi, transferencia...). El local lo revisa
 * y lo marca como pagado (POST /orders/:id/confirm-payment); el cliente recibe la confirmación por WhatsApp.
 */
export default function PaymentProofModal({
  order,
  onClose,
  onConfirmed,
}: {
  order: ProofOrder;
  onClose: () => void;
  onConfirmed: (updated: ConfirmedPayment) => void;
}) {
  const { token } = useAuth();
  const { url, loading, failed } = useChatMediaUrl(order.restaurantId, order.paymentProofUrl);
  const isPdf = order.paymentProofUrl?.endsWith('.pdf');
  const paid = order.paymentStatus === 'PAID';
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/confirm-payment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.message === 'string' ? data.message : 'No se pudo confirmar el pago');
      onConfirmed({ id: order.id, paymentStatus: data.paymentStatus ?? 'PAID', paymentMethod: data.paymentMethod ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo confirmar el pago');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="proof-title">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !saving && onClose()} aria-hidden />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-800 p-4">
          <div className="min-w-0">
            <h2 id="proof-title" className="text-base font-bold text-white">
              Comprobante · Turno {orderNumberLabel(order)}
            </h2>
            <p className="truncate text-xs text-slate-400">
              {order.customerName}
              {order.total != null && ` · $${order.total.toLocaleString('es-CO')}`}
              {order.paymentProofAt &&
                ` · recibido ${new Date(order.paymentProofAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-[12rem] flex-1 items-center justify-center overflow-auto bg-slate-950 p-3">
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          ) : failed || !url ? (
            <p className="text-sm text-slate-500">No se pudo cargar el comprobante.</p>
          ) : isPdf ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200 hover:border-slate-500">
              <FileText className="h-5 w-5" /> Abrir comprobante (PDF) ↗
            </a>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- blob local del comprobante
            <img src={url} alt={`Comprobante del pedido ${orderNumberLabel(order)}`} className="max-h-[60vh] w-auto max-w-full rounded-lg object-contain" />
          )}
        </div>

        <footer className="space-y-2 border-t border-slate-800 p-4">
          {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
          {paid ? (
            <p className="flex items-center justify-center gap-2 text-sm font-bold text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> Pago confirmado
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={confirm}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-black text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirmar pago
              </button>
              <p className="text-center text-[11px] text-slate-500">
                Revisa que el valor y el destino coincidan. Al confirmar, el cliente recibe un aviso por WhatsApp.
              </p>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
