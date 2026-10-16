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
