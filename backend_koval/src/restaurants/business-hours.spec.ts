import { BadRequestException } from '@nestjs/common';
import { parseBusinessHours } from './business-hours';

describe('parseBusinessHours', () => {
  it('acepta un horario válido, incluido el cierre pasada la medianoche', () => {
    const hours = {
      monday: [{ open: '11:00', close: '22:00' }],
      friday: [
        { open: '12:00', close: '15:00' },
        { open: '18:00', close: '02:00' },
      ],
      sunday: [],
    };
    expect(parseBusinessHours(hours)).toEqual(hours);
  });

  it('descarta propiedades extra de cada franja', () => {
    expect(parseBusinessHours({ monday: [{ open: '09:00', close: '17:00', hack: 1 }] })).toEqual({
      monday: [{ open: '09:00', close: '17:00' }],
    });
  });

  it.each([
    ['no es objeto', []],
    ['día desconocido', { lunes: [] }],
    ['franja no es lista', { monday: { open: '09:00', close: '17:00' } }],
    ['hora mal formada', { monday: [{ open: '9:00', close: '17:00' }] }],
    ['hora fuera de rango', { monday: [{ open: '24:00', close: '17:00' }] }],
    ['apertura igual al cierre', { monday: [{ open: '10:00', close: '10:00' }] }],
    ['demasiadas franjas', { monday: Array(4).fill({ open: '09:00', close: '10:00' }) }],
  ])('rechaza: %s', (_, value) => {
    expect(() => parseBusinessHours(value)).toThrow(BadRequestException);
  });
});
