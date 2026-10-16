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

export function isRestaurantClosed(
  restaurant: { isTemporarilyClosed?: boolean | null; businessHours?: BusinessHours | null },
  now = new Date(),
): boolean {
  return Boolean(restaurant.isTemporarilyClosed) || !isWithinBusinessHours(restaurant.businessHours, now);
}

/** Horario en texto ("Lun 11:00–22:00 · Mar cerrado · ...") */
export function formatBusinessHours(hours: BusinessHours | null | undefined): string {
  if (!hours) return '';
  return WEEK_DAYS.map((day) => {
    const ranges = hours[day] ?? [];
    return `${DAY_LABELS[day]} ${ranges.length ? ranges.map((r) => `${r.open}–${r.close}`).join(', ') : 'cerrado'}`;
  }).join(' · ');
}
