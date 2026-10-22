/**
 * Estado de atención del local (misma lógica que backend_koval/src/restaurants/business-hours.ts).
 * Se evalúa SIEMPRE en la zona horaria del local, no en la del navegador del cliente:
 * un cliente con el teléfono en otra zona debe ver el mismo estado que el bot.
 */
export const RESTAURANT_TIMEZONE = 'America/Bogota';

export const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

export interface TimeRange {
  open: string; // "HH:MM" 24h
  close: string; // menor que open = cierra pasada la medianoche
}

export type BusinessHours = Partial<Record<WeekDay, TimeRange[]>>;

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

/** ¿Está abierto según el horario? Sin horario configurado = abierto. */
export function isWithinBusinessHours(
  hours: BusinessHours | null | undefined,
  now = new Date(),
  timeZone = RESTAURANT_TIMEZONE,
): boolean {
  if (!hours) return true;
  const { day, minute } = localDayAndMinute(now, timeZone);
  const previousDay = WEEK_DAYS[(WEEK_DAYS.indexOf(day) + 6) % 7];

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
export function hasActiveExtension(extendedUntil: string | Date | null | undefined, now = new Date()): boolean {
  if (!extendedUntil) return false;
  const until = new Date(extendedUntil).getTime();
  return Number.isFinite(until) && until > now.getTime();
}

/**
 * Prioridad (igual que el backend):
 * 1. Cierre de emergencia = CERRADO siempre (kill switch absoluto).
 * 2. Prórroga vigente = ABIERTO aunque esté fuera de horario.
 * 3. Horario regular (una prórroga vencida se ignora).
 */
export function isRestaurantClosed(
  restaurant: {
    isTemporarilyClosed?: boolean | null;
    businessHours?: BusinessHours | null;
    extendedUntil?: string | Date | null;
  },
  now = new Date(),
): boolean {
  if (restaurant.isTemporarilyClosed) return true;
  if (hasActiveExtension(restaurant.extendedUntil, now)) return false;
  return !isWithinBusinessHours(restaurant.businessHours, now);
}

/** Hora en la zona del local, ej. "12:30 a. m." */
export function formatLocalTime(date: string | Date): string {
  return new Date(date).toLocaleTimeString('es-CO', {
    timeZone: RESTAURANT_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Horario en texto ("Lun 11:00–22:00 · Mar cerrado · ...") */
export function formatBusinessHours(hours: BusinessHours | null | undefined): string {
  if (!hours) return '';
  return WEEK_DAYS.map((day) => {
    const ranges = hours[day] ?? [];
    return `${DAY_LABELS[day]} ${ranges.length ? ranges.map((r) => `${r.open}–${r.close}`).join(', ') : 'cerrado'}`;
  }).join(' · ');
}

export const DAY_NAMES: Record<WeekDay, string> = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

/** Día de la semana actual en la zona del local */
export function getLocalWeekDay(now = new Date(), timeZone = RESTAURANT_TIMEZONE): WeekDay {
  return localDayAndMinute(now, timeZone).day;
}

/**
 * Hora de cierre ("HH:MM") de la franja abierta en este momento, o null si no hay
 * franja activa o el local no tiene horario. Contempla franjas que cruzan la medianoche.
 */
export function currentClosingTime(
  hours: BusinessHours | null | undefined,
  now = new Date(),
  timeZone = RESTAURANT_TIMEZONE,
): string | null {
  if (!hours) return null;
  const { day, minute } = localDayAndMinute(now, timeZone);
  const previousDay = WEEK_DAYS[(WEEK_DAYS.indexOf(day) + 6) % 7];
  const today = (hours[day] ?? []).find(({ open, close }) => {
    const o = toMinutes(open);
    const c = toMinutes(close);
    return c > o ? minute >= o && minute < c : minute >= o;
  });
  if (today) return today.close;
  const fromYesterday = (hours[previousDay] ?? []).find(
    ({ open, close }) => toMinutes(close) < toMinutes(open) && minute < toMinutes(close),
  );
  return fromYesterday?.close ?? null;
}

/** "23:00" -> "11:00 p. m." */
export function formatClock12h(time: string): string {
  const h = Number(time.slice(0, 2));
  const m = time.slice(3, 5);
  const suffix = h >= 12 ? 'p. m.' : 'a. m.';
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${suffix}`;
}

/**
 * Nombre corto de un grupo de días: tramos seguidos de 3+ días van como rango.
 * [lunes..viernes] -> "Lun – Vie"; [sábado, domingo] -> "Sáb y Dom".
 */
function describeDayGroup(days: WeekDay[]): string {
  const runs: WeekDay[][] = [];
  for (const day of days) {
    const last = runs[runs.length - 1];
    if (last && WEEK_DAYS.indexOf(day) === WEEK_DAYS.indexOf(last[last.length - 1]) + 1) last.push(day);
    else runs.push([day]);
  }
  const parts = runs.flatMap((run) =>
    run.length >= 3 ? [`${DAY_LABELS[run[0]]} – ${DAY_LABELS[run[run.length - 1]]}`] : run.map((d) => DAY_LABELS[d]),
  );
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/**
 * Horario agrupado (misma lógica que formatScheduleLines del backend): los días con
 * exactamente las mismas franjas comparten fila. Ej. { days: "Lun – Vie", time: "3:00 p. m. – 11:00 p. m." }
 */
export function groupBusinessHours(hours: BusinessHours | null | undefined): Array<{ days: string; time: string }> {
  if (!hours) return [];
  const groups = new Map<string, { days: WeekDay[]; ranges: TimeRange[] }>();
  for (const day of WEEK_DAYS) {
    const ranges = [...(hours[day] ?? [])].sort((a, b) => a.open.localeCompare(b.open));
    const key = ranges.map((r) => `${r.open}-${r.close}`).join(',');
    const group = groups.get(key) ?? { days: [], ranges };
    group.days.push(day);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ days, ranges }) => ({
    days: describeDayGroup(days),
    time: ranges.length
      ? ranges.map((r) => `${formatClock12h(r.open)} – ${formatClock12h(r.close)}`).join(' y ')
      : 'Cerrado',
  }));
}
