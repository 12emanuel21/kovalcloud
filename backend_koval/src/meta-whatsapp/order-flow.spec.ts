import type { OrderIntent } from '../ai/ai.service';
import {
  buildConfirmationMessage,
  buildOrderLines,
  buildOrderNotes,
  hasRequiredData,
  orderTotal,
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
  responseToUser: '',
  sendMenuPdf: false,
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

  it('confirmación de domicilio usa la frase exacta con el total', () => {
    const lines = buildOrderLines(
      [
        { productId: 'pizza', quantity: 1 },
        { productId: 'limonada', quantity: 2 },
      ],
      MENU,
    );
    const msg = buildConfirmationMessage(ai({ orderType: 'DELIVERY', deliveryAddress: 'Cra 1 # 2-3' }), lines);
    expect(msg).toContain('Tu total es $53.000. Se paga al recibir. ¿Confirmas?');
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
});
