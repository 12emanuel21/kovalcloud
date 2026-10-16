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

const DAY_LABELS: Record<WeekDay, string> = {
  monday: 'Lun',
  tuesday: 'Mar',
  wednesday: 'Mié',
  thursday: 'Jue',
  friday: 'Vie',
  saturday: 'Sáb',
  sunday: 'Dom',
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
 * Estado de atención del local.
 * 1. Prórroga vigente (extendedUntil > ahora): ABIERTO, ignora el horario y el cierre de emergencia.
 * 2. Si no: cerrado por botón de emergencia o por estar fuera de horario.
 * Una prórroga vencida se ignora (equivale a null).
 */
export function isRestaurantClosed(
  restaurant: { isTemporarilyClosed?: boolean | null; businessHours?: unknown; extendedUntil?: Date | string | null },
  now = new Date(),
): boolean {
  if (hasActiveExtension(restaurant.extendedUntil, now)) return false;
  return Boolean(restaurant.isTemporarilyClosed) || !isWithinBusinessHours(readBusinessHours(restaurant.businessHours), now);
}

/** Horario en texto para mensajes ("Lun 11:00–22:00 · Mar cerrado · ...") */
export function formatBusinessHours(hours: BusinessHours | null): string {
  if (!hours) return '';
  return WEEK_DAYS.map((day) => {
    const ranges = hours[day] ?? [];
    return `${DAY_LABELS[day]} ${ranges.length ? ranges.map((r) => `${r.open}–${r.close}`).join(', ') : 'cerrado'}`;
  }).join(' · ');
}

/** Mensaje para el cliente cuando el local está cerrado: el del dueño o uno con el horario */
export function buildClosedMessage(restaurant: {
  name: string;
  closedMessage?: string | null;
  businessHours?: unknown;
}): string {
  if (restaurant.closedMessage?.trim()) return restaurant.closedMessage.trim();
  const schedule = formatBusinessHours(readBusinessHours(restaurant.businessHours));
  return schedule
    ? `Hola 👋 En este momento ${restaurant.name} está cerrado. Nuestro horario es: ${schedule}.`
    : `Hola 👋 En este momento ${restaurant.name} está cerrado. ¡Escríbenos más tarde!`;
}
