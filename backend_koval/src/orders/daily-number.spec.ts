import { businessDayStart, dailyNumberOf, formatDailyNumber, withDailyNumbers } from './daily-number';

// Bogotá = UTC-5 (sin horario de verano): 05:00 local = 10:00 UTC
describe('Turno del día', () => {
  it('la jornada arranca a las 5:00 hora del local: la 1:00 a. m. sigue en la jornada anterior', () => {
    expect(businessDayStart(new Date('2026-11-03T15:00:00Z'), 'America/Bogota').toISOString()).toBe('2026-11-03T10:00:00.000Z');
    // 1:00 a. m. del 4 (06:00 UTC) -> jornada que empezó el 3 a las 5:00
    expect(businessDayStart(new Date('2026-11-04T06:00:00Z'), 'America/Bogota').toISOString()).toBe('2026-11-03T10:00:00.000Z');
    // 5:00 en punto abre una jornada nueva
    expect(businessDayStart(new Date('2026-11-04T10:00:00Z'), 'America/Bogota').toISOString()).toBe('2026-11-04T10:00:00.000Z');
  });

  it('formato de dos dígitos', () => {
    expect(formatDailyNumber(7)).toBe('#07');
    expect(formatDailyNumber(123)).toBe('#123');
  });

  it('numera en memoria por restaurante y jornada, en orden de llegada (aunque la lista venga al revés)', () => {
    const at = (iso: string) => new Date(iso);
    const orders = [
      { id: 'c', restaurantId: 'r1', createdAt: at('2026-11-04T06:00:00Z') }, // 1 a. m.: misma jornada del 3
      { id: 'b', restaurantId: 'r1', createdAt: at('2026-11-03T20:00:00Z') },
      { id: 'x', restaurantId: 'r2', createdAt: at('2026-11-03T21:00:00Z') },
      { id: 'a', restaurantId: 'r1', createdAt: at('2026-11-03T16:00:00Z') },
      { id: 'd', restaurantId: 'r1', createdAt: at('2026-11-04T15:00:00Z') }, // jornada nueva
    ];
    const numbers = Object.fromEntries(withDailyNumbers(orders).map((o) => [o.id, o.dailyNumber]));
    expect(numbers).toEqual({ a: 1, b: 2, c: 3, x: 1, d: 1 });
  });

  it('pedido suelto: cuenta los anteriores del local en su jornada', async () => {
    const prisma = { order: { count: jest.fn().mockResolvedValue(4) } };
    const createdAt = new Date('2026-11-03T20:00:00Z');
    await expect(dailyNumberOf(prisma, { id: 'o', restaurantId: 'r1', createdAt })).resolves.toBe(5);
    expect(prisma.order.count).toHaveBeenCalledWith({
      where: { restaurantId: 'r1', createdAt: { gte: businessDayStart(createdAt), lt: createdAt } },
    });
  });
});
