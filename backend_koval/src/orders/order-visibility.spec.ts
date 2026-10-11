import { Role } from '@prisma/client';
import { orderViewFor, redactOrderFinancials } from './order-visibility';

const order = {
  id: 'o1',
  customerName: 'Ana',
  total: 52000,
  notes: 'sin cebolla',
  items: [
    { id: 'i1', quantity: 2, unitPrice: 26000, subtotal: 52000, menuItem: { id: 'm1', name: 'Pizza', price: 26000 } },
  ],
};

describe('order-visibility (blindaje financiero KITCHEN)', () => {
  it('quita total, precios y subtotales sin tocar lo operativo', () => {
    const redacted = redactOrderFinancials(order);
    expect(redacted.total).toBeNull();
    expect(redacted.items[0]).toMatchObject({ quantity: 2, unitPrice: null, subtotal: null });
    expect(redacted.items[0].menuItem).toEqual({ id: 'm1', name: 'Pizza', price: null });
    expect(redacted).toMatchObject({ customerName: 'Ana', notes: 'sin cebolla' });
    // No muta el original (se emite también, completo, a la sala del dueño)
    expect(order.total).toBe(52000);
  });

  it('solo se aplica a KITCHEN, para un pedido o una lista', () => {
    expect(orderViewFor(Role.KITCHEN, [order])[0].total).toBeNull();
    expect(orderViewFor(Role.OWNER, order)).toBe(order);
    expect(orderViewFor(Role.SUPERADMIN, [order])[0].total).toBe(52000);
  });
});
