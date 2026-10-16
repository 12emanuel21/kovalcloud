import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Prórroga de horario: minutos desde ahora; null o 0 cancela la prórroga */
export class ExtendHoursDto {
  @IsOptional()
  @IsInt({ message: 'minutes debe ser un número entero de minutos' })
  @Min(0)
  @Max(720, { message: 'La prórroga máxima es de 12 horas (720 minutos)' })
  minutes?: number | null;
}
