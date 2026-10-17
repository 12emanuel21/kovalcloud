import { BadRequestException } from '@nestjs/common';
import {
  buildClosedMessage,
  buildClosedNotice,
  formatScheduleLines,
  formatTime12h,
  hasActiveExtension,
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
    expect(buildClosedMessage({ name: 'X', businessHours: hours })).toContain('• *Miércoles:* 11:00 a. m. – 10:00 p. m.');
  });
});

describe('prórroga de horario (extendedUntil)', () => {
  const now = new Date('2026-10-14T23:30:00-05:00'); // miércoles 23:30 en Bogotá
  const hours = { wednesday: [{ open: '11:00', close: '22:00' }] };
  const in30 = new Date(now.getTime() + 30 * 60_000);
  const past = new Date(now.getTime() - 60_000);

  it('una prórroga vigente abre el local aunque esté fuera de horario', () => {
    expect(isRestaurantClosed({ businessHours: hours }, now)).toBe(true);
    expect(isRestaurantClosed({ businessHours: hours, extendedUntil: in30 }, now)).toBe(false);
  });

  it('el cierre de emergencia es un kill switch: gana sobre una prórroga vigente', () => {
    expect(isRestaurantClosed({ isTemporarilyClosed: true, businessHours: hours, extendedUntil: in30 }, now)).toBe(true);
  });

  it('el cierre de emergencia gana también dentro del horario regular', () => {
    const lunch = new Date('2026-10-14T13:00:00-05:00');
    expect(isRestaurantClosed({ isTemporarilyClosed: true, businessHours: hours }, lunch)).toBe(true);
    expect(isRestaurantClosed({ isTemporarilyClosed: false, businessHours: hours }, lunch)).toBe(false);
  });

  it('una prórroga vencida se ignora (como si fuera null)', () => {
    expect(isRestaurantClosed({ businessHours: hours, extendedUntil: past }, now)).toBe(true);
    expect(hasActiveExtension(past, now)).toBe(false);
  });

  it('acepta la fecha como string ISO (así llega desde el JSON de la API)', () => {
    expect(hasActiveExtension(in30.toISOString(), now)).toBe(true);
    expect(hasActiveExtension('no-es-fecha', now)).toBe(false);
  });
});

describe('mensaje de local cerrado (WhatsApp)', () => {
  const everyDay = (open: string, close: string) =>
    Object.fromEntries(
      ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => [d, [{ open, close }]]),
    );

  it('convierte la hora militar a formato a. m. / p. m.', () => {
    expect(formatTime12h('16:00')).toBe('4:00 p. m.');
    expect(formatTime12h('00:30')).toBe('12:30 a. m.');
    expect(formatTime12h('12:00')).toBe('12:00 p. m.');
    expect(formatTime12h('09:05')).toBe('9:05 a. m.');
  });

  it('formato completo cuando todos los días tienen el mismo horario', () => {
    expect(buildClosedMessage({ name: 'Pizzería Nápoles', businessHours: everyDay('16:00', '23:00') })).toBe(
      '¡Hola! 👋 En este momento Pizzería Nápoles se encuentra cerrado. 🌙\n\n' +
        '🕒 *Nuestro horario de atención es:*\n' +
        '• *Lunes a Domingo:* 4:00 p. m. – 11:00 p. m.',
    );
  });

  it('agrupa días con las mismas franjas, incluidos turnos partidos y días cerrados', () => {
    const split = [
      { open: '18:00', close: '22:00' },
      { open: '12:00', close: '15:00' },
    ];
    const lines = formatScheduleLines({
      monday: split,
      tuesday: split,
      wednesday: split,
      thursday: split,
      friday: split,
      saturday: [{ open: '12:00', close: '02:00' }],
      sunday: [],
    });
    expect(lines).toEqual([
      '• *Lunes a Viernes:* 12:00 p. m. – 3:00 p. m. y 6:00 p. m. – 10:00 p. m.',
      '• *Sábado:* 12:00 p. m. – 2:00 a. m.',
      '• *Domingo:* Cerrado',
    ]);
  });

  it('días no consecutivos con el mismo horario se listan con comas e "y"', () => {
    const same = [{ open: '10:00', close: '20:00' }];
    expect(
      formatScheduleLines({ monday: same, tuesday: same, wednesday: same, thursday: [], friday: same, saturday: [], sunday: same }),
    ).toEqual(['• *Lunes a Miércoles, Viernes y Domingo:* 10:00 a. m. – 8:00 p. m.', '• *Jueves y Sábado:* Cerrado']);
  });

  it('sin horario configurado, o con cierre de emergencia, ajusta el texto', () => {
    expect(buildClosedMessage({ name: 'X' })).toBe(
      '¡Hola! 👋 En este momento X se encuentra cerrado. 🌙\n\n¡Escríbenos más tarde y con gusto te atenderemos!',
    );
    expect(buildClosedMessage({ name: 'X', isTemporarilyClosed: true })).toContain('se encuentra cerrado temporalmente');
  });

  it('el aviso HTTP para la carta web es texto plano (sin formato de WhatsApp)', () => {
    expect(buildClosedNotice({ name: 'X' })).toBe('X está cerrado en este momento y no está recibiendo pedidos.');
    expect(buildClosedNotice({ name: 'X', closedMessage: ' Volvemos mañana ' })).toBe('Volvemos mañana');
  });
});
