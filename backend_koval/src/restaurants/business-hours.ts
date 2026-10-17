import { BadRequestException } from '@nestjs/common';

/** Días válidos en businessHours (claves en inglés, estables para el bot y la carta) */
export const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

export interface TimeRange {
  open: string; // "HH:MM" 24h
  close: string; // "HH:MM" 24h; menor que open = cierra pasada la medianoche
}

/** Horario semanal: cada día lista sus franjas; un día ausente o vacío = cerrado */
export type BusinessHours = Partial<Record<WeekDay, TimeRange[]>>;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_RANGES_PER_DAY = 3;

/**
 * Valida y normaliza businessHours. Lanza BadRequestException con un mensaje legible
 * si el formato no es el esperado (nunca se guarda JSON arbitrario en la BD).
 */
export function parseBusinessHours(value: unknown): BusinessHours {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BadRequestException('businessHours debe ser un objeto { monday: [{ open, close }], ... }');
  }

  const result: BusinessHours = {};
  for (const [day, ranges] of Object.entries(value as Record<string, unknown>)) {
    if (!(WEEK_DAYS as readonly string[]).includes(day)) {
      throw new BadRequestException(`Día no válido en businessHours: "${day}"`);
    }
    if (!Array.isArray(ranges) || ranges.length > MAX_RANGES_PER_DAY) {
      throw new BadRequestException(`"${day}" debe ser una lista de hasta ${MAX_RANGES_PER_DAY} franjas`);
    }
    result[day as WeekDay] = ranges.map((range: unknown) => {
      const { open, close } = (range ?? {}) as Record<string, unknown>;
      if (typeof open !== 'string' || typeof close !== 'string' || !TIME_PATTERN.test(open) || !TIME_PATTERN.test(close)) {
        throw new BadRequestException(`Horario inválido en "${day}": usa { "open": "HH:MM", "close": "HH:MM" } (24h)`);
      }
      if (open === close) {
        throw new BadRequestException(`En "${day}" la hora de apertura y la de cierre no pueden ser iguales`);
      }
      return { open, close };
    });
  }
  return result;
}

/**
 * Zona horaria del local. El schema aún no la guarda por restaurante y el servidor corre en UTC,
 * así que el horario se evalúa siempre en la hora del local (no en la del servidor ni del cliente).
 */
export const RESTAURANT_TIMEZONE = process.env.RESTAURANT_TIMEZONE || 'America/Bogota';

const DAY_NAMES: Record<WeekDay, string> = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Día de la semana y minuto del día en la zona horaria indicada */
function localDayAndMinute(now: Date, timeZone: string): { day: WeekDay; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    day: get('weekday').toLowerCase() as WeekDay,
    minute: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** Lee el JSON guardado; si no es un horario válido devuelve null (se trata como "sin horario") */
export function readBusinessHours(value: unknown): BusinessHours | null {
  if (value === null || value === undefined) return null;
  try {
    return parseBusinessHours(value);
  } catch {
    return null;
  }
}

/**
 * ¿Está abierto según el horario? Sin horario configurado = abierto.
 * Una franja con cierre menor que la apertura cruza la medianoche (se revisa también la del día anterior).
 */
export function isWithinBusinessHours(hours: BusinessHours | null, now = new Date(), timeZone = RESTAURANT_TIMEZONE): boolean {
  if (!hours) return true;
  const { day, minute } = localDayAndMinute(now, timeZone);
  const dayIndex = WEEK_DAYS.indexOf(day);
  const previousDay = WEEK_DAYS[(dayIndex + 6) % 7];

  const openToday = (hours[day] ?? []).some(({ open, close }) => {
    const o = toMinutes(open);
    const c = toMinutes(close);
    return c > o ? minute >= o && minute < c : minute >= o;
  });
  const openFromYesterday = (hours[previousDay] ?? []).some(({ open, close }) => {
    const c = toMinutes(close);
    return c < toMinutes(open) && minute < c;
  });
  return openToday || openFromYesterday;
}

/** ¿Hay una prórroga de horario vigente? (extendedUntil en el futuro) */
export function hasActiveExtension(extendedUntil: Date | string | null | undefined, now = new Date()): boolean {
  if (!extendedUntil) return false;
  const until = new Date(extendedUntil).getTime();
  return Number.isFinite(until) && until > now.getTime();
}

/**
 * Estado de atención del local, en orden de prioridad:
 * 1. Cierre de emergencia (isTemporarilyClosed): CERRADO siempre. Es un kill switch absoluto,
 *    por encima de cualquier prórroga y del horario.
 * 2. Prórroga vigente (extendedUntil > ahora): ABIERTO aunque esté fuera de horario.
 * 3. Horario regular. Una prórroga vencida se ignora (equivale a null).
 */
export function isRestaurantClosed(
  restaurant: { isTemporarilyClosed?: boolean | null; businessHours?: unknown; extendedUntil?: Date | string | null },
  now = new Date(),
): boolean {
  if (restaurant.isTemporarilyClosed) return true;
  if (hasActiveExtension(restaurant.extendedUntil, now)) return false;
  return !isWithinBusinessHours(readBusinessHours(restaurant.businessHours), now);
}

/** "16:00" -> "4:00 p. m." (formato de hora colombiano) */
export function formatTime12h(time: string): string {
  const hours = Number(time.slice(0, 2));
  const minutes = time.slice(3, 5);
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'a. m.' : 'p. m.'}`;
}

/** Une con comas y "y": ["Lunes", "Miércoles", "Viernes"] -> "Lunes, Miércoles y Viernes" */
function joinSpanish(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/**
 * Nombre de un grupo de días: tramos seguidos de 3+ días se escriben como rango.
 * ["monday".."friday"] -> "Lunes a Viernes"; [sábado, domingo] -> "Sábado y Domingo";
 * [lunes, martes, miércoles, viernes] -> "Lunes a Miércoles y Viernes".
 */
function describeDayGroup(days: WeekDay[]): string {
  const runs: WeekDay[][] = [];
  for (const day of days) {
    const last = runs[runs.length - 1];
    if (last && WEEK_DAYS.indexOf(day) === WEEK_DAYS.indexOf(last[last.length - 1]) + 1) last.push(day);
    else runs.push([day]);
  }
  return joinSpanish(
    runs.flatMap((run) =>
      run.length >= 3 ? [`${DAY_NAMES[run[0]]} a ${DAY_NAMES[run[run.length - 1]]}`] : run.map((day) => DAY_NAMES[day]),
    ),
  );
}

/**
 * Horario para WhatsApp: una viñeta por grupo de días con exactamente las mismas franjas.
 *   • *Lunes a Viernes:* 12:00 p. m. – 3:00 p. m. y 6:00 p. m. – 10:00 p. m.
 *   • *Domingo:* Cerrado
 */
export function formatScheduleLines(hours: BusinessHours): string[] {
  const groups = new Map<string, { days: WeekDay[]; ranges: TimeRange[] }>();
  for (const day of WEEK_DAYS) {
    const ranges = [...(hours[day] ?? [])].sort((a, b) => a.open.localeCompare(b.open));
    const key = ranges.map((r) => `${r.open}-${r.close}`).join(',');
    const group = groups.get(key) ?? { days: [], ranges };
    group.days.push(day);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ days, ranges }) => {
    const time = ranges.length
      ? ranges.map((r) => `${formatTime12h(r.open)} – ${formatTime12h(r.close)}`).join(' y ')
      : 'Cerrado';
    return `• *${describeDayGroup(days)}:* ${time}`;
  });
}

/**
 * Mensaje de WhatsApp cuando el local está cerrado: el personalizado del dueño o,
 * si no hay, uno con saludo, aviso de cierre y el horario agrupado.
 */
export function buildClosedMessage(restaurant: {
  name: string;
  closedMessage?: string | null;
  businessHours?: unknown;
  isTemporarilyClosed?: boolean | null;
}): string {
  if (restaurant.closedMessage?.trim()) return restaurant.closedMessage.trim();

  const status = restaurant.isTemporarilyClosed ? 'se encuentra cerrado temporalmente' : 'se encuentra cerrado';
  const greeting = `¡Hola! 👋 En este momento ${restaurant.name} ${status}. 🌙`;
  const hours = readBusinessHours(restaurant.businessHours);
  if (!hours) return `${greeting}\n\n¡Escríbenos más tarde y con gusto te atenderemos!`;

  return `${greeting}\n\n🕒 *Nuestro horario de atención es:*\n${formatScheduleLines(hours).join('\n')}`;
}

/** Aviso de cierre en texto plano (respuestas HTTP que muestra la carta web, sin formato de WhatsApp) */
export function buildClosedNotice(restaurant: { name: string; closedMessage?: string | null }): string {
  return restaurant.closedMessage?.trim() || `${restaurant.name} está cerrado en este momento y no está recibiendo pedidos.`;
}
