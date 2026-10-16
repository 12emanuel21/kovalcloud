import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Configuración operativa del local (Ajustes > Perfil del Local).
 * Campos ausentes no se tocan; un texto vacío o null borra el valor.
 * businessHours se valida en el servicio (parseBusinessHours).
 */
export class UpdateRestaurantConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  paymentDetails?: string | null;

  @IsOptional()
  @IsObject()
  businessHours?: Record<string, unknown> | null;

  @IsOptional()
  @IsBoolean()
  isTemporarilyClosed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  closedMessage?: string | null;
}
