'use client';

import React, { useState } from 'react';
import { useCart } from '@/context/CartContext';

interface CartDrawerProps {
  restaurantId: string;
  restaurantName: string;
  restaurantPhone?: string;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  restaurantId,
  restaurantName,
  restaurantPhone = '573001234567', // Teléfono por defecto para pruebas
}) => {
  const { items, totalCount, totalAmount, updateQuantity, removeItem, clearCart } = useCart();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Campos del formulario
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');

  const formatCOP = (val: number) => {
    return `$${val.toLocaleString('es-CO')} COP`;
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
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
    setErrorMsg(null);

    try {
      // 1. Enviar orden a la API de NestJS
      const payload = {
        restaurantId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        deliveryAddress: deliveryAddress.trim() || undefined,
        notes: notes.trim() || undefined,
        items: items.map((item) => ({
          menuItemId: item.id,
          quantity: item.quantity,
          unitPrice: item.price,
        })),
      };

      const res = await fetch('http://localhost:4000/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Error al procesar el pedido (${res.status})`);
      }

      const createdOrder = await res.json();
      const orderShortId = (createdOrder.id || 'NUEVA').slice(0, 8).toUpperCase();

      // 2. Construir detalle de items para WhatsApp
      const itemsDetail = items
        .map(
          (item) =>
            `• ${item.quantity}x ${item.name} ($${(item.price * item.quantity).toLocaleString('es-CO')} COP)`
        )
        .join('\n');

      // 3. Construir mensaje preformateado para WhatsApp
      const whatsappMessage = `👋 ¡Hola! Acabo de hacer un pedido desde el menú digital de *${restaurantName}*:

🧾 *Orden:* #${orderShortId}
👤 *Cliente:* ${customerName.trim()}
📞 *Teléfono:* ${customerPhone.trim()}
📍 *Dirección:* ${deliveryAddress.trim() || 'Para recoger / No especificada'}

🛒 *Detalle del Pedido:*
${itemsDetail}

💰 *Total a Pagar:* ${formatCOP(totalAmount)}
📝 *Notas:* ${notes.trim() || 'Ninguna'}`;

      // 4. Redirigir a WhatsApp
      const cleanPhone = restaurantPhone.replace(/\D/g, '');
      const encodedMsg = encodeURIComponent(whatsappMessage);
      const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedMsg}`;

      // Limpiar y resetear
      clearCart();
      setCustomerName('');
      setCustomerPhone('');
      setDeliveryAddress('');
      setNotes('');
      setIsOpen(false);

      // Abrir WhatsApp en nueva pestaña
      window.open(whatsappUrl, '_blank');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error inesperado al crear el pedido';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Botón Flotante Inferior (Sticky Bottom Bar) */}
      {totalCount > 0 && !isOpen && (
        <div className="fixed bottom-4 left-4 right-4 z-40 max-w-md mx-auto animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="bg-slate-900/95 border border-emerald-500/40 backdrop-blur-xl rounded-2xl p-3.5 shadow-2xl shadow-emerald-950/60 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="h-11 w-11 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-emerald-500/30">
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
                <span className="absolute -top-1.5 -right-1.5 bg-emerald-400 text-slate-950 text-[11px] font-black h-5 min-w-5 px-1 rounded-full flex items-center justify-center border-2 border-slate-900 shadow">
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
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-sm px-5 py-2.5 rounded-xl transition shadow-lg shadow-emerald-500/25 active:scale-95 flex items-center gap-2"
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

      {/* Drawer Modal / Sheet de Checkout */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          {/* Drawer Container */}
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col z-10 animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 sticky top-0 z-20 backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xs border border-emerald-500/20">
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
                  <h2 className="text-base font-bold text-white leading-tight">Tu Pedido</h2>
                  <p className="text-xs text-slate-400">
                    {totalCount} {totalCount === 1 ? 'producto' : 'productos'} añadidos
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm transition"
              >
                ✕
              </button>
            </div>

            {/* Body desplazable */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Lista de Platos en el Carrito */}
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
                          <p className="text-xs text-emerald-400 font-medium">
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
                      Nombre Completo <span className="text-emerald-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Ej. Carlos Gómez"
                      required
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Teléfono / WhatsApp <span className="text-emerald-400">*</span>
                    </label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Ej. 300 123 4567"
                      required
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Dirección de Entrega (Opcional)
                    </label>
                    <input
                      type="text"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Ej. Cra 45 # 26-85 Apto 401"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Notas del Pedido (Opcional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ej. Sin cebolla en la pizza, llevar cambio de 50mil..."
                      rows={2}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 outline-none transition resize-none"
                    />
                  </div>
                </form>
              )}
            </div>

            {/* Footer con Resumen y Botón de WhatsApp */}
            {items.length > 0 && (
              <div className="p-5 border-t border-slate-800 bg-slate-900/90 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 font-medium">Total a Pagar:</span>
                  <span className="text-xl font-extrabold text-emerald-400 font-mono">
                    {formatCOP(totalAmount)}
                  </span>
                </div>

                <button
                  type="submit"
                  form="checkout-form"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:opacity-50 text-white font-bold py-3.5 px-4 rounded-xl transition shadow-lg shadow-green-900/40 active:scale-[0.98] flex items-center justify-center gap-2.5"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Procesando Pedido...</span>
                    </>
                  ) : (
                    <>
                      {/* Icono de WhatsApp */}
                      <svg
                        className="h-5 w-5 fill-current"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm.01 1.67c4.54 0 8.24 3.7 8.24 8.24 0 2.2-.86 4.27-2.42 5.83a8.188 8.188 0 0 1-5.82 2.41c-1.42 0-2.82-.37-4.06-1.07l-.29-.17-3.02.79.81-2.94-.19-.3a8.19 8.19 0 0 1-1.25-4.55c0-4.54 3.7-8.24 8.24-8.24zm4.72 11.64c-.26-.13-1.53-.76-1.77-.85-.24-.09-.41-.13-.58.13-.17.26-.67.85-.82 1.02-.15.17-.3.19-.56.06-.26-.13-1.1-.41-2.09-1.3-.77-.69-1.29-1.54-1.44-1.8-.15-.26-.02-.4.11-.53.12-.12.26-.3.39-.45.13-.15.17-.26.26-.43.09-.17.04-.32-.02-.45-.06-.13-.58-1.4-79-1.92-.21-.51-.43-.44-.58-.45h-.5c-.17 0-.45.06-.69.32-.24.26-.91.89-.91 2.17s.93 2.52 1.06 2.69c.13.17 1.83 2.8 4.43 3.92.62.27 1.1.43 1.48.55.62.2 1.19.17 1.64.1.5-.07 1.53-.63 1.75-1.23.21-.6.21-1.12.15-1.23-.07-.11-.24-.17-.5-.3z" />
                      </svg>
                      <span>Confirmar Pedido por WhatsApp</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
