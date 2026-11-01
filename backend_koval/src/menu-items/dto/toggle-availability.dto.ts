import { IsBoolean, IsOptional } from 'class-validator';

/**
 * PATCH /menu-items/:id/toggle-availability
 * Con isAvailable fija el valor (idempotente, seguro ante doble clic); sin él, invierte el actual.
 */
export class ToggleAvailabilityDto {
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
