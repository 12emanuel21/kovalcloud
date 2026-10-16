import { BadRequestException } from '@nestjs/common';
import {
  buildClosedMessage,
  isRestaurantClosed,
  isWithinBusinessHours,
  parseBusinessHours,
} from './business-hours';

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

describe('isWithinBusinessHours / isRestaurantClosed (zona America/Bogota, UTC-5)', () => {
  // 2026-10-14 es miércoles. 20:00 en Bogotá = 01:00 UTC del día siguiente.
  const bogota = (isoLocal: string) => new Date(`${isoLocal}-05:00`);
  const hours = {
    wednesday: [{ open: '11:00', close: '22:00' }],
    friday: [{ open: '18:00', close: '02:00' }],
  };

  it('sin horario configurado se considera abierto', () => {
    expect(isWithinBusinessHours(null, bogota('2026-10-14T03:00:00'))).toBe(true);
  });

  it('dentro y fuera de una franja normal (usa la hora local, no la UTC del servidor)', () => {
    expect(isWithinBusinessHours(hours, bogota('2026-10-14T20:00:00'))).toBe(true);
    expect(isWithinBusinessHours(hours, bogota('2026-10-14T22:00:00'))).toBe(false);
    expect(isWithinBusinessHours(hours, bogota('2026-10-14T10:59:00'))).toBe(false);
  });

  it('día sin franjas = cerrado', () => {
    expect(isWithinBusinessHours(hours, bogota('2026-10-15T12:00:00'))).toBe(false); // jueves
  });

  it('franja que cruza la medianoche cubre la madrugada del día siguiente', () => {
    expect(isWithinBusinessHours(hours, bogota('2026-10-16T23:30:00'))).toBe(true); // viernes
    expect(isWithinBusinessHours(hours, bogota('2026-10-17T01:30:00'))).toBe(true); // sábado madrugada
    expect(isWithinBusinessHours(hours, bogota('2026-10-17T02:00:00'))).toBe(false);
  });

  it('el cierre de emergencia gana sobre el horario', () => {
    const now = bogota('2026-10-14T20:00:00');
    expect(isRestaurantClosed({ isTemporarilyClosed: false, businessHours: hours }, now)).toBe(false);
    expect(isRestaurantClosed({ isTemporarilyClosed: true, businessHours: hours }, now)).toBe(true);
  });

  it('mensaje de cierre: el del dueño o uno con el horario', () => {
    expect(buildClosedMessage({ name: 'X', closedMessage: '  Volvemos mañana  ' })).toBe('Volvemos mañana');
    expect(buildClosedMessage({ name: 'X', businessHours: hours })).toContain('Mié 11:00–22:00');
  });
});
