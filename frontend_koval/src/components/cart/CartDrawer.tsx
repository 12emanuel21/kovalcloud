'use client';

import React, { useEffect, useState } from 'react';
import { useCart } from '@/context/CartContext';
import { DEFAULT_MENU_THEME, type MenuTheme } from '@/lib/menu-themes';
import { buildOrderWhatsAppMessage, shortOrderId, toWhatsAppNumber, whatsappLink } from '@/lib/whatsapp';

const API_URL = typeof window !== 'undefined' ? '/api' : 'http://koval_backend:4000';

/**
 * Acento del carrito según el tema de la carta: solo CTA y bordes activos.
 * El resto del drawer es neutro (casi negro) en todos los temas.
 */
const ACCENTS: Record<
  MenuTheme,
  { cta: string; ctaShadow: string; barBorder: string; badge: string; text: string; soft: string; focus: string }
> = {
  'dark-premium': {
    cta: 'bg-red-600 hover:bg-red-700 text-white',
    ctaShadow: 'shadow-red-950/50',
    barBorder: 'border-red-600/40',
    badge: 'bg-red-500 text-white',
    text: 'text-red-400',
    soft: 'bg-red-500/10 text-red-400 border-red-500/20',
    focus: 'focus:border-red-500 focus:ring-red-500',
  },
  // Mismo acento rojo que el tema oscuro (diseño de referencia en claro y oscuro)
  'clean-light': {
    cta: 'bg-red-600 hover:bg-red-700 text-white',
    ctaShadow: 'shadow-red-900/30',
    barBorder: 'border-red-600/40',
    badge: 'bg-red-500 text-white',
    text: 'text-red-400',
    soft: 'bg-red-500/10 text-red-400 border-red-500/20',
    focus: 'focus:border-red-500 focus:ring-red-500',
  },
};

type PaymentMethod = 'WOMPI' | 'CASH';

const Spinner = () => (
  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
  </svg>
);

const CardIcon = () => (
  <svg
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect width="20" height="14" x="2" y="5" rx="2" />
    <line x1="2" x2="22" y1="10" y2="10" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm.01 1.67c4.54 0 8.24 3.7 8.24 8.24 0 2.2-.86 4.27-2.42 5.83a8.188 8.188 0 0 1-5.82 2.41c-1.42 0-2.82-.37-4.06-1.07l-.29-.17-3.02.79.81-2.94-.19-.3a8.19 8.19 0 0 1-1.25-4.55c0-4.54 3.7-8.24 8.24-8.24zm4.72 11.64c-.26-.13-1.53-.76-1.77-.85-.24-.09-.41-.13-.58.13-.17.26-.67.85-.82 1.02-.15.17-.3.19-.56.06-.26-.13-1.1-.41-2.09-1.3-.77-.69-1.29-1.54-1.44-1.8-.15-.26-.02-.4.11-.53.12-.12.26-.3.39-.45.13-.15.17-.26.26-.43.09-.17.04-.32-.02-.45-.06-.13-.58-1.4-.79-1.92-.21-.51-.43-.44-.58-.45h-.5c-.17 0-.45.06-.69.32-.24.26-.91.89-.91 2.17s.93 2.52 1.06 2.69c.13.17 1.83 2.8 4.43 3.92.62.27 1.1.43 1.48.55.62.2 1.19.17 1.64.1.5-.07 1.53-.63 1.75-1.23.21-.6.21-1.12.15-1.23-.07-.11-.24-.17-.5-.3z" />
  </svg>
);

interface CartDrawerProps {
  restaurantId: string;
  restaurantName?: string;
  /** Teléfono del local tal como se guardó (respaldo si el backend no envía whatsappNumber) */
  restaurantPhone?: string;
  /** WhatsApp del local para wa.me (dígitos con indicativo); null = el local no tiene teléfono */
  whatsappNumber?: string | null;
  tableNumber?: string;
  /** Local cerrado (emergencia u horario): no se pueden enviar pedidos */
  isClosed?: boolean;
  closedNotice?: string;
  /** Tema de la carta: define el color de acento de los botones */
  theme?: MenuTheme;
  /** El backend confirma que el local puede cobrar en línea (llaves completas + interruptor) */
  onlinePaymentsEnabled?: boolean;
  /** Interruptor manual del dueño: apagado = solo efectivo / WhatsApp, aunque haya llaves */
  isWompiEnabled?: boolean;
  /** Modo controlado (opcional): permite abrir el carrito desde fuera, ej. el icono del header */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  restaurantId,
  restaurantName,
  restaurantPhone = '',
  whatsappNumber,
  tableNumber,
  isClosed = false,
  closedNotice = 'En este momento estamos cerrados.',
  theme = DEFAULT_MENU_THEME,
  open,
  onOpenChange,
  onlinePaymentsEnabled = false,
  isWompiEnabled = false,
}) => {
  // "Pagar en línea" solo con el interruptor del dueño encendido Y las llaves completas
  const canPayOnline = isWompiEnabled && onlinePaymentsEnabled;
  const accent = ACCENTS[theme] ?? ACCENTS[DEFAULT_MENU_THEME];
  const { items, totalCount, totalAmount, updateQuantity, removeItem, clearCart } = useCart();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setIsOpen = (value: boolean) => (onOpenChange ? onOpenChange(value) : setInternalOpen(value));
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Método con el que se está enviando (spinner en el botón correcto)
  const [submittingMethod, setSubmittingMethod] = useState<PaymentMethod | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Pedido recién creado (efectivo): se confirma dentro del drawer
  const [confirmation, setConfirmation] = useState<{ orderId: string; whatsappUrl: string | null } | null>(null);
  // El chat SIEMPRE va al WhatsApp del local, nunca al teléfono que escribe el cliente
  const localWhatsApp = whatsappNumber ?? toWhatsAppNumber(restaurantPhone);
  // Solo mientras el carrito siga vacío: si agregan platos de nuevo, vuelve el formulario
  const shownConfirmation = items.length === 0 ? confirmation : null;

  const closeDrawer = () => {
    setIsOpen(false);
    setConfirmation(null);
  };

  // Drawer abierto: Escape lo cierra y la página de fondo no hace scroll
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
    // closeDrawer cambia en cada render; solo importa si el drawer está abierto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Campos del formulario
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');

  const formatCOP = (val: number) => {
    return `$${val.toLocaleString('es-CO')} COP`;
  };

  const handleCheckout = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Botón que envió el formulario (value="WOMPI" | "CASH"); Enter en un campo usa el primero
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const paymentMethod: PaymentMethod =
      canPayOnline && submitter?.value === 'WOMPI' ? 'WOMPI' : 'CASH';
    if (isClosed) {
      setErrorMsg(closedNotice);
      return;
    }
    if (!customerName.trim()) {
      setErrorMsg('Por favor ingresa tu nombre.');
      return;
    }
    if (!customerPhone.trim()) {
      setErrorMsg('Por favor ingresa tu número de WhatsApp / Teléfono.');
      return;
    }
    if (items.length === 0) {
      setErrorMsg('Tu carrito está vacío.');
      return;
    }

    setIsSubmitting(true);
    setSubmittingMethod(paymentMethod);
    setErrorMsg(null);

    try {
      // 1. Enviar orden a la API de NestJS
      const payload = {
        restaurantId,
        orderType: tableNumber ? 'DINE_IN' : 'DELIVERY',
        tableNumber: tableNumber || undefined,
        channel: 'WEB_MENU',
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        deliveryAddress: tableNumber ? undefined : (deliveryAddress.trim() || undefined),
        notes: notes.trim() || undefined,
        paymentMethod,
        items: items.map((item) => ({
          menuItemId: item.id,
          quantity: item.quantity,
          unitPrice: item.price,
        })),
      };

      const res = await fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Error al procesar el pedido (${res.status})`);
      }

      const createdOrder: { id: string; wompiCheckoutUrl?: string | null } = await res.json();

      const resetForm = () => {
        clearCart();
        setCustomerName('');
        setCustomerPhone('');
        setDeliveryAddress('');
        setNotes('');
      };

      // Pago en línea: a la pasarela de Wompi (vuelve a la carta con ?pedido=<id>).
      // Si el backend no pudo generar el link, se sigue por WhatsApp (el pedido ya existe).
      if (paymentMethod === 'WOMPI' && createdOrder.wompiCheckoutUrl) {
        resetForm();
        setIsOpen(false);
        window.location.href = createdOrder.wompiCheckoutUrl;
        return;
      }

      // Carrito Híbrido: el pedido ya quedó registrado (Kanban/KDS); el cliente abre el chat
      // DEL LOCAL con el resumen. Sin teléfono del local no hay a dónde enviarlo: solo se confirma.
      const whatsappUrl = localWhatsApp
        ? whatsappLink(
            localWhatsApp,
            buildOrderWhatsAppMessage({
              orderId: createdOrder.id,
              restaurantName,
              customerName: payload.customerName,
              items: items.map(({ name, quantity, price }) => ({ name, quantity, price })),
              total: totalAmount,
              deliveryAddress: payload.deliveryAddress,
              tableNumber: payload.tableNumber,
              notes: payload.notes,
            }),
          )
        : null;

      resetForm();
      setConfirmation({ orderId: createdOrder.id, whatsappUrl });

      // Abrir WhatsApp en nueva pestaña. Tras un await, Safari/iOS suelen bloquear el popup:
      // en ese caso se navega en la misma pestaña (el pedido ya está guardado).
      if (whatsappUrl) {
        const popup = window.open(whatsappUrl, '_blank');
        if (!popup) window.location.href = whatsappUrl;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error inesperado al crear el pedido';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
      setSubmittingMethod(null);
    }
  };

  return (
    <>
      {/* Botón Flotante Inferior (Sticky Bottom Bar) */}
      {totalCount > 0 && !isOpen && (
        <div className="fixed bottom-4 left-4 right-4 z-40 max-w-md mx-auto animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className={`bg-slate-900/95 border ${accent.barBorder} backdrop-blur-xl rounded-2xl p-3.5 shadow-2xl shadow-black/60 flex items-center justify-between gap-4`}>
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={`h-11 w-11 rounded-xl ${accent.cta} flex items-center justify-center font-black shadow-lg ${accent.ctaShadow}`}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="8" cy="21" r="1" />
                    <circle cx="19" cy="21" r="1" />
                    <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                  </svg>
                </div>
                <span className={`absolute -top-1.5 -right-1.5 ${accent.badge} text-[11px] font-black h-5 min-w-5 px-1 rounded-full flex items-center justify-center border-2 border-slate-900 shadow`}>
                  {totalCount}
                </span>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  Total Carrito
                </p>
                <p className="text-base font-extrabold text-white tracking-tight">
                  {formatCOP(totalAmount)}
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(true)}
              className={`${accent.cta} font-bold text-sm px-5 py-2.5 rounded-xl transition shadow-lg ${accent.ctaShadow} active:scale-95 flex items-center gap-2`}
            >
              <span>Ver Pedido</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Drawer lateral derecho de checkout */}
      {isOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm animate-cart-backdrop-in motion-reduce:animate-none"
            onClick={closeDrawer}
            aria-hidden
          />

          {/* Panel: cabecera fija, cuerpo con scroll y pie fijo */}
          <aside className="fixed inset-y-0 right-0 flex h-full w-full max-w-md flex-col border-l border-slate-800 bg-slate-900 shadow-2xl shadow-black/60 animate-cart-drawer-in motion-reduce:animate-none">
            {/* Header */}
            <div className="shrink-0 p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
              <div className="flex items-center gap-2.5">
                <div className={`h-8 w-8 rounded-lg ${accent.soft} flex items-center justify-center font-bold text-xs border`}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="8" cy="21" r="1" />
                    <circle cx="19" cy="21" r="1" />
                    <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                  </svg>
                </div>
                <div>
                  <h2 id="cart-drawer-title" className="text-base font-bold text-white leading-tight">Tu Pedido</h2>
                  <p className="text-xs text-slate-400">
                    {totalCount} {totalCount === 1 ? 'producto' : 'productos'} añadidos
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Cerrar carrito"
                className="h-8 w-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm transition"
              >
                ✕
              </button>
            </div>

            {/* Body desplazable */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-6">
              {shownConfirmation && (
                <div className="space-y-4 py-6 text-center" role="status">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-2xl">
                    ✅
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-white">¡Pedido #{shortOrderId(shownConfirmation.orderId)} recibido!</h3>
                    <p className="text-sm text-slate-400">
                      {shownConfirmation.whatsappUrl
                        ? 'Envía el mensaje que abrimos en WhatsApp para confirmarlo con el local.'
                        : 'El local ya lo tiene en su sistema y te contactará al número que dejaste.'}
                    </p>
                  </div>
                  {shownConfirmation.whatsappUrl && (
                    <a
                      href={shownConfirmation.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-95"
                    >
                      <WhatsAppIcon />
                      Abrir WhatsApp de nuevo
                    </a>
                  )}
                </div>
              )}

              {/* Lista de Platos en el Carrito */}
              {!shownConfirmation && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Resumen de Productos
                </h3>

                {items.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 space-y-2">
                    <p className="text-sm">No hay productos en el carrito.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">{item.name}</p>
                          <p className={`text-xs ${accent.text} font-medium`}>
                            {formatCOP(item.price * item.quantity)}
                          </p>
                        </div>

                        {/* Controles de Cantidad */}
                        <div className="flex items-center gap-2">
                          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              className="h-6 w-6 rounded flex items-center justify-center text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                            >
                              -
                            </button>
                            <span className="w-6 text-center text-xs font-bold text-white">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="h-6 w-6 rounded flex items-center justify-center text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                            >
                              +
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="h-7 w-7 rounded-lg text-red-400/80 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition"
                            title="Eliminar plato"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}

              {/* Formulario de Datos de Entrega */}
              {items.length > 0 && (
                <form id="checkout-form" onSubmit={handleCheckout} className="space-y-4 pt-2 border-t border-slate-800">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Datos de Entrega
                  </h3>

                  {errorMsg && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium flex items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Nombre Completo <span className={accent.text}>*</span>
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Ej. Carlos Gómez"
                      required
                      className={`w-full bg-slate-950 border border-slate-800 ${accent.focus} focus:ring-1 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Teléfono / WhatsApp <span className={accent.text}>*</span>
                    </label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Ej. 300 123 4567"
                      required
                      className={`w-full bg-slate-950 border border-slate-800 ${accent.focus} focus:ring-1 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition`}
                    />
                  </div>

                  {!tableNumber && (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Dirección de Entrega (Opcional)
                      </label>
                      <input
                        type="text"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="Ej. Cra 45 # 26-85 Apto 401"
                        className={`w-full bg-slate-950 border border-slate-800 ${accent.focus} focus:ring-1 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition`}
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Notas del Pedido (Opcional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ej. Sin cebolla en la pizza, llevar cambio de 50mil..."
                      rows={2}
                      className={`w-full bg-slate-950 border border-slate-800 ${accent.focus} focus:ring-1 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 outline-none transition resize-none`}
                    />
                  </div>
                </form>
              )}
            </div>

            {/* Footer fijo con Resumen y Botones de Pago */}
            {shownConfirmation && (
              <div className="shrink-0 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-slate-800 bg-slate-900">
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="w-full rounded-xl border border-slate-600 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800/60"
                >
                  Seguir viendo la carta
                </button>
              </div>
            )}
            {items.length > 0 && (
              <div className="shrink-0 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-slate-800 bg-slate-900 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 font-medium">Total a Pagar:</span>
                  <span className={`text-xl font-extrabold ${accent.text} font-mono`}>
                    {formatCOP(totalAmount)}
                  </span>
                </div>

                {isClosed ? (
                  <button
                    type="button"
                    disabled
                    className="w-full bg-slate-800 text-slate-400 font-bold py-3.5 px-4 rounded-xl opacity-70"
                  >
                    🔒 Local cerrado: no estamos recibiendo pedidos
                  </button>
                ) : canPayOnline ? (
                  <>
                    <button
                      type="submit"
                      form="checkout-form"
                      value="WOMPI"
                      disabled={isSubmitting}
                      className={`w-full ${accent.cta} disabled:opacity-50 font-bold py-3.5 px-4 rounded-xl transition shadow-lg ${accent.ctaShadow} active:scale-[0.98] flex items-center justify-center gap-2.5`}
                    >
                      {submittingMethod === 'WOMPI' ? (
                        <>
                          <Spinner />
                          <span>Preparando tu pago...</span>
                        </>
                      ) : (
                        <>
                          <CardIcon />
                          <span>Pagar en Línea (Nequi / Tarjetas)</span>
                        </>
                      )}
                    </button>
                    <button
                      type="submit"
                      form="checkout-form"
                      value="CASH"
                      disabled={isSubmitting}
                      className="w-full border border-slate-600 hover:border-slate-400 hover:bg-slate-800/60 disabled:opacity-50 text-slate-200 font-semibold py-3 px-4 rounded-xl transition active:scale-[0.98] flex items-center justify-center gap-2.5"
                    >
                      {submittingMethod === 'CASH' ? (
                        <>
                          <Spinner />
                          <span>Procesando Pedido...</span>
                        </>
                      ) : (
                        <span>Pago en Efectivo / Contra Entrega</span>
                      )}
                    </button>
                    <p className="text-center text-[11px] text-slate-500">
                      Pago seguro con Wompi (Bancolombia). Te enviaremos el link también por WhatsApp.
                    </p>
                  </>
                ) : (
                  <button
                    type="submit"
                    form="checkout-form"
                    value="CASH"
                    disabled={isSubmitting}
                    className={`w-full ${accent.cta} disabled:opacity-50 font-bold py-3.5 px-4 rounded-xl transition shadow-lg ${accent.ctaShadow} active:scale-[0.98] flex items-center justify-center gap-2.5`}
                  >
                    {isSubmitting ? (
                      <>
                        <Spinner />
                        <span>Procesando Pedido...</span>
                      </>
                    ) : (
                      <>
                        <WhatsAppIcon />
                        <span>Confirmar Pedido por WhatsApp</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
};
