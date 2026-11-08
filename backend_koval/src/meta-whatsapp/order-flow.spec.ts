import type { OrderIntent } from '../ai/ai.service';
import {
  buildAddOnConfirmationMessage,
  buildAddOnRegisteredMessage,
  buildConfirmationMessage,
  buildOrderLines,
  buildOrderStatusMessage,
  buildWebOrderReceivedMessage,
  nameFromWebOrderMessage,
  NO_RECENT_ORDER_REPLY,
  parseWebOrderReference,
  buildOrderNotes,
  buildPaymentInstructions,
  buildRegisteredMessage,
  hasRequiredData,
  needsPaymentMethod,
  orderTotal,
  toOrderPaymentMethod,
  withPaymentMethodQuestion,
} from './order-flow';

const MENU = [
  { id: 'pizza', name: 'Pizza Pepperoni', price: 35000 },
  { id: 'limonada', name: 'Limonada de Coco', price: 9000 },
];

const ai = (overrides: Partial<OrderIntent>): OrderIntent => ({
  intent: 'ORDER',
  items: [],
  readyToConfirm: false,
  customerConfirmed: false,
  addToPreviousOrder: false,
  responseToUser: '',
  sendMenuPdf: false,
  sendMenuLink: false,
  ...overrides,
});

describe('order-flow', () => {
  it('calcula precios desde la BD e ignora IDs inexistentes', () => {
    const lines = buildOrderLines(
      [
        { productId: 'pizza', quantity: 2 },
        { productId: 'inventado', quantity: 5 },
      ],
      MENU,
    );
    expect(lines).toHaveLength(1);
    expect(orderTotal(lines)).toBe(70000);
  });

  it('no tiene límite de valor: pedidos grandes se calculan completos', () => {
    const lines = buildOrderLines([{ productId: 'pizza', quantity: 500 }], MENU);
    expect(orderTotal(lines)).toBe(17_500_000);
  });

  it('domicilio exige dirección', () => {
    const lines = buildOrderLines([{ productId: 'pizza', quantity: 1 }], MENU);
    expect(hasRequiredData(ai({ orderType: 'DELIVERY' }), lines)).toBe(false);
    expect(hasRequiredData(ai({ orderType: 'DELIVERY', deliveryAddress: 'Cra 1 # 2-3' }), lines)).toBe(true);
  });

  it('confirmación de domicilio: total exacto y el método de pago elegido (no asume "se paga al recibir")', () => {
    const lines = buildOrderLines(
      [
        { productId: 'pizza', quantity: 1 },
        { productId: 'limonada', quantity: 2 },
      ],
      MENU,
    );
    const delivery = { orderType: 'DELIVERY' as const, deliveryAddress: 'Cra 1 # 2-3' };
    const cash = buildConfirmationMessage(ai({ ...delivery, paymentMethod: 'CASH' }), lines);
    // Domicilio: total en productos + aclaración del envío (nunca un flete inventado)
    expect(cash).toContain(
      'Tu total en productos es $53.000. El valor del domicilio, si aplica, se suma según tu zona.\nPago: Efectivo al recibir\n\n¿Confirmas?',
    );
    expect(cash).not.toContain('Se paga al recibir');
    expect(buildConfirmationMessage(ai({ ...delivery, paymentMethod: 'TRANSFER' }), lines)).toContain('Pago: Transferencia');
    expect(buildConfirmationMessage(ai({ orderType: 'TAKEAWAY', paymentMethod: 'CASH' }), lines)).toContain(
      'Pago: Efectivo al recoger',
    );
  });

  it('método de pago: solo domicilio/recoger lo necesitan y se registra como CASH o TRANSFERENCIA', () => {
    expect(needsPaymentMethod(ai({ orderType: 'DELIVERY' }))).toBe(true);
    expect(needsPaymentMethod(ai({ orderType: 'TAKEAWAY' }))).toBe(true);
    expect(needsPaymentMethod(ai({ orderType: 'DINE_IN' }))).toBe(false);
    expect(toOrderPaymentMethod(ai({ orderType: 'DELIVERY', paymentMethod: 'CASH' }))).toBe('CASH');
    expect(toOrderPaymentMethod(ai({ orderType: 'TAKEAWAY', paymentMethod: 'TRANSFER' }))).toBe('TRANSFERENCIA');
    expect(toOrderPaymentMethod(ai({ orderType: 'DELIVERY' }))).toBeNull();
    expect(toOrderPaymentMethod(ai({ orderType: 'DINE_IN', paymentMethod: 'CASH' }))).toBeNull();
  });

  it('si la IA no preguntó el método de pago, el backend lo pregunta (sin repetirlo)', () => {
    expect(withPaymentMethodQuestion(ai({ orderType: 'DELIVERY' }), 'Perfecto.')).toBe(
      'Perfecto.\n\n¿Pagas en efectivo al recibir o por transferencia?',
    );
    expect(withPaymentMethodQuestion(ai({ orderType: 'TAKEAWAY' }), '')).toBe(
      '¿Pagas en efectivo al recoger o por transferencia?',
    );
    const asked = 'Listo. ¿Pagas en efectivo o por transferencia?';
    expect(withPaymentMethodQuestion(ai({ orderType: 'DELIVERY' }), asked)).toBe(asked);
  });

  it('al registrar: transferencia con datos de pago y comprobante; efectivo sin cuentas', () => {
    const details = 'Nequi 300 123 4567';
    const transfer = buildPaymentInstructions(ai({ orderType: 'DELIVERY', paymentMethod: 'TRANSFER' }), details);
    expect(transfer).toBe('💳 *Datos de pago:*\nNequi 300 123 4567\n\nPor favor envíanos la captura del comprobante por aquí.');
    // Sin método (no debería pasar en el bot) se trata como transferencia
    expect(buildPaymentInstructions(ai({ orderType: 'DELIVERY' }), details)).toBe(transfer);
    const cash = buildPaymentInstructions(ai({ orderType: 'DELIVERY', paymentMethod: 'CASH' }), details);
    expect(cash).toBe('Pagas en efectivo al recibir.');
    expect(cash).not.toContain('Nequi');
    expect(buildPaymentInstructions(ai({ orderType: 'TAKEAWAY', paymentMethod: 'TRANSFER' }), null)).toContain(
      'te compartimos los datos',
    );
    expect(
      buildPaymentInstructions(ai({ orderType: 'DINE_IN', reservation: { people: 2, time: '8 pm' } }), details),
    ).toBeNull();
    expect(buildRegisteredMessage(ai({ orderType: 'DELIVERY' }), 1)).toBe(
      '✅ Pedido confirmado. Tu turno es el #01. Ya lo estamos preparando.',
    );
  });

  it('reserva de mesa exige personas y hora, y puede ir sin comida', () => {
    expect(hasRequiredData(ai({ intent: 'RESERVATION', orderType: 'DINE_IN' }), [])).toBe(false);
    const reservation = ai({
      intent: 'RESERVATION',
      orderType: 'DINE_IN',
      reservation: { people: 4, time: '8:00 pm' },
    });
    expect(hasRequiredData(reservation, [])).toBe(true);
    expect(buildConfirmationMessage(reservation, [])).toContain('4 personas a las 8:00 pm');
    expect(buildConfirmationMessage(reservation, [])).toMatch(/¿Confirmas\?$/);
    expect(buildOrderNotes(reservation, [])).toBe('📅 RESERVA: 4 personas · 8:00 pm');
  });

  it('productos fuera de carta o datos raros de la IA se descartan sin romper el flujo', () => {
    const lines = buildOrderLines(
      [
        { productId: 'coca-cola', quantity: 1 }, // no está en la carta
        { productId: 'pizza', quantity: 0 },
        { productId: 'pizza', quantity: 1.7 },
        { productId: 'LIMONADA de coco ', quantity: 2, notes: ' sin hielo ' }, // nombre en vez de ID
        null as never,
        { productId: 42 as never, quantity: 1 },
      ],
      MENU,
    );
    expect(lines.map((l) => [l.menuItemId, l.quantity])).toEqual([
      ['pizza', 1],
      ['limonada', 2],
    ]);
    expect(orderTotal(lines)).toBe(53000);
    expect(buildOrderNotes(ai({}), lines)).toBe('Limonada de Coco: sin hielo');
    expect(buildOrderLines(undefined as never, MENU)).toEqual([]);
  });

  it('una reserva a medio pedir (sin hora) no es una reserva completa', () => {
    expect(hasRequiredData(ai({ orderType: 'DINE_IN', reservation: { people: 2 } }), [])).toBe(false);
    expect(hasRequiredData(ai({ orderType: 'DINE_IN', reservation: { time: '8 pm' } }), [])).toBe(false);
  });

  it('para recoger no menciona domicilio', () => {
    const lines = buildOrderLines([{ productId: 'pizza', quantity: 1 }], MENU);
    const msg = buildConfirmationMessage(ai({ orderType: 'TAKEAWAY', paymentMethod: 'CASH' }), lines);
    expect(msg).toContain('Tu total es $35.000.');
    expect(msg).not.toContain('domicilio');
  });

  it('adición a un pedido registrado: confirma solo lo nuevo y responde con el nuevo total', () => {
    const lines = buildOrderLines([{ productId: 'limonada', quantity: 1 }], MENU);
    expect(buildAddOnConfirmationMessage(lines, 7)).toBe(
      '➕ *Agregar a tu pedido #07:*\n• 1x Limonada de Coco — $9.000\n\nValor adicional: $9.000. ¿Confirmas?',
    );
    expect(buildAddOnRegisteredMessage(lines, 7, 44000)).toBe(
      '✅ Listo, agregamos 1x Limonada de Coco a tu pedido #07. Nuevo total en productos: $44.000.',
    );
  });

  it('estado del pedido: responde con el estado real según tipo, repartidor y pago', () => {
    const base = { orderType: 'DELIVERY', archivedAt: null, driverName: null, paymentMethod: 'CASH', paymentStatus: 'PENDING' };
    expect(buildOrderStatusMessage({ ...base, status: 'PENDING' }, 3)).toBe('Tu pedido #03 está recibido y en cola. En breve la cocina empieza a prepararlo.');
    expect(buildOrderStatusMessage({ ...base, status: 'PREPARING' }, 3)).toBe('Tu pedido #03 está en preparación en la cocina.');
    expect(buildOrderStatusMessage({ ...base, status: 'DELIVERED', driverName: 'Juan' }, 3)).toBe('Tu pedido #03 va en camino con Juan.');
    expect(buildOrderStatusMessage({ ...base, status: 'DELIVERED', archivedAt: new Date() }, 3)).toBe('Tu pedido #03 ya fue entregado.');
    expect(buildOrderStatusMessage({ ...base, status: 'DELIVERED', orderType: 'TAKEAWAY' }, 3)).toBe('Tu pedido #03 está listo para recoger.');
    expect(buildOrderStatusMessage({ ...base, status: 'CANCELLED' }, 3)).toContain('fue cancelado');
    expect(buildOrderStatusMessage({ ...base, status: 'PREPARING', paymentMethod: 'TRANSFERENCIA' }, 3)).toContain('pendiente de validar');
    expect(buildOrderStatusMessage(null, null)).toBe(NO_RECENT_ORDER_REPLY);
  });

  it('pedido web: reconoce "Acabo de hacer el pedido *#07*" (turno o código corto) y el nombre', () => {
    const message = '¡Hola Betania! Soy Ana Pérez 👋\nAcabo de hacer el pedido *#07*:\n\n• 1x Perro — $20.000';
    expect(parseWebOrderReference(message)).toEqual({ dailyNumber: 7 });
    expect(parseWebOrderReference('Acabo de hacer el pedido *#0F8FAD5B*:')).toEqual({ idPrefix: '0f8fad5b' });
    expect(parseWebOrderReference('Acabo de hacer el pedido #00')).toBeNull();
    expect(parseWebOrderReference('quiero hacer un pedido')).toBeNull();
    expect(nameFromWebOrderMessage(message)).toBe('Ana Pérez');
  });

  it('pedido web recibido: texto fijo de preparación, nunca "en camino"', () => {
    const delivery = buildWebOrderReceivedMessage({ orderType: 'DELIVERY', paymentMethod: 'CASH' }, 1, 'Ana');
    expect(delivery).toBe(
      '¡Hola Ana! Recibimos tu pedido *#01*. 👨‍🍳 El equipo ya lo está preparando en cocina. Te notificaremos por aquí cuando salga con el repartidor.',
    );
    expect(delivery).not.toContain('en camino');
    expect(buildWebOrderReceivedMessage({ orderType: 'TAKEAWAY' }, 2, null)).toBe(
      '¡Hola! Recibimos tu pedido *#02*. 👨‍🍳 El equipo ya lo está preparando en cocina. Te avisamos por aquí cuando esté listo para recoger.',
    );
  });

  it('pedido web por transferencia/Nequi: agrega los datos de pago (solo si no está pagado)', () => {
    const transfer = buildWebOrderReceivedMessage({ orderType: 'DELIVERY', paymentMethod: 'NEQUI', paymentStatus: 'PENDING' }, 3, 'Ana', 'Nequi 300 123 4567');
    expect(transfer).toContain('💳 *Datos de pago:*\nNequi 300 123 4567\n\nPor favor envíanos la captura del comprobante por aquí.');
    expect(buildWebOrderReceivedMessage({ orderType: 'DELIVERY', paymentMethod: 'TRANSFERENCIA', paymentStatus: 'PAID' }, 3, 'Ana', 'Nequi')).not.toContain('Datos de pago');
    expect(buildWebOrderReceivedMessage({ orderType: 'DELIVERY', paymentMethod: 'WOMPI' }, 3, 'Ana', 'Nequi')).not.toContain('Datos de pago');
  });

  it('domicilio listo sin despacho: no dice "en camino" (eso solo con repartidor)', () => {
    const msg = buildOrderStatusMessage({ status: 'DELIVERED', orderType: 'DELIVERY', archivedAt: null, driverName: null }, 4);
    expect(msg).toBe('Tu pedido #04 está listo. Te avisamos por aquí cuando salga con el repartidor.');
  });
});
