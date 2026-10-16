import { WEEK_DAYS, type BusinessHours, type TimeRange, type WeekDay } from '@/lib/business-hours';

/**
 * Editor de horarios tipo "alarma": cada bloque es una franja (apertura–cierre) aplicada
 * a varios días. El backend guarda el horario por día (businessHours), así que aquí se
 * convierte en ambos sentidos.
 */
export interface ScheduleBlock {
  id: string;
  open: string; // "HH:MM"
  close: string; // "HH:MM"; menor que open = cierra pasada la medianoche
  days: WeekDay[]; // siempre en el orden de WEEK_DAYS
}

export const DAY_PILLS: Record<WeekDay, { short: string; label: string }> = {
  monday: { short: 'L', label: 'Lunes' },
  tuesday: { short: 'M', label: 'Martes' },
  wednesday: { short: 'X', label: 'Miércoles' },
  thursday: { short: 'J', label: 'Jueves' },
  friday: { short: 'V', label: 'Viernes' },
  saturday: { short: 'S', label: 'Sábado' },
  sunday: { short: 'D', label: 'Domingo' },
};

/** Límite de franjas por día que acepta el backend (restaurants/business-hours.ts) */
const MAX_RANGES_PER_DAY = 3;

let blockSequence = 0;
const newBlockId = () => `block-${++blockSequence}`;

const sortDays = (days: WeekDay[]) => WEEK_DAYS.filter((day) => days.includes(day));

export function createBlock(fields: Partial<Omit<ScheduleBlock, 'id'>> = {}): ScheduleBlock {
  return {
    id: newBlockId(),
    open: fields.open ?? '11:00',
    close: fields.close ?? '22:00',
    days: sortDays(fields.days ?? [...WEEK_DAYS]),
  };
}

/** Días que todavía no cubre ningún bloque (para preseleccionarlos al agregar uno nuevo) */
export function uncoveredDays(blocks: ScheduleBlock[]): WeekDay[] {
  return WEEK_DAYS.filter((day) => !blocks.some((block) => block.days.includes(day)));
}

/**
 * Backend → bloques: cada franja distinta se convierte en un bloque con todos los días que la tienen.
 * Ej. L–V 12–15 y 18–22 + S 12–23 → tres bloques. Sin horario (null) → sin bloques.
 */
export function hoursToBlocks(hours: BusinessHours | null | undefined): ScheduleBlock[] {
  if (!hours) return [];
  const byRange = new Map<string, ScheduleBlock>();
  for (const day of WEEK_DAYS) {
    for (const { open, close } of hours[day] ?? []) {
      const key = `${open}-${close}`;
      const block = byRange.get(key) ?? createBlock({ open, close, days: [] });
      if (!block.days.includes(day)) block.days.push(day);
      byRange.set(key, block);
    }
  }
  return [...byRange.values()].sort(
    (a, b) => WEEK_DAYS.indexOf(a.days[0]) - WEEK_DAYS.indexOf(b.days[0]) || a.open.localeCompare(b.open),
  );
}

/**
 * Bloques → backend: agrupa las franjas de cada día (ordenadas por apertura).
 * Sin bloques = null ("sin horario": la carta y el bot consideran el local siempre abierto).
 */
export function blocksToHours(blocks: ScheduleBlock[]): BusinessHours | null {
  if (blocks.length === 0) return null;
  const hours: BusinessHours = {};
  for (const day of WEEK_DAYS) {
    const ranges: TimeRange[] = blocks
      .filter((block) => block.days.includes(day))
      .map(({ open, close }) => ({ open, close }))
      .sort((a, b) => a.open.localeCompare(b.open));
    hours[day] = ranges;
  }
  return hours;
}

/** Primer error de los bloques, o null si se pueden guardar */
export function validateBlocks(blocks: ScheduleBlock[]): string | null {
  for (const [index, block] of blocks.entries()) {
    const name = `Horario ${index + 1}`;
    if (block.days.length === 0) return `${name}: selecciona al menos un día`;
    if (!block.open || !block.close) return `${name}: indica la hora de apertura y de cierre`;
    if (block.open === block.close) return `${name}: la apertura y el cierre no pueden ser iguales`;
  }
  for (const day of WEEK_DAYS) {
    const ranges = blocks.filter((block) => block.days.includes(day));
    if (ranges.length > MAX_RANGES_PER_DAY) {
      return `${DAY_PILLS[day].label}: máximo ${MAX_RANGES_PER_DAY} horarios por día`;
    }
    const keys = ranges.map(({ open, close }) => `${open}-${close}`);
    if (new Set(keys).size !== keys.length) {
      return `${DAY_PILLS[day].label} tiene el mismo horario repetido en dos bloques`;
    }
  }
  return null;
}

/** Resumen legible de los días de un bloque ("Lun a Vie", "Sáb y Dom", "Todos los días") */
export function describeDays(days: WeekDay[]): string {
  if (days.length === 0) return 'Ningún día';
  if (days.length === WEEK_DAYS.length) return 'Todos los días';
  const indexes = days.map((day) => WEEK_DAYS.indexOf(day));
  const consecutive = indexes.every((value, i) => i === 0 || value === indexes[i - 1] + 1);
  const short = (day: WeekDay) => DAY_PILLS[day].label.slice(0, 3);
  if (consecutive && days.length > 2) return `${short(days[0])} a ${short(days[days.length - 1])}`;
  if (days.length === 2) return `${short(days[0])} y ${short(days[1])}`;
  return days.map(short).join(', ');
}
