import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateDeliveryZoneDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la zona es obligatorio' })
  @MaxLength(80)
  name: string;

  /** Barrios o sectores que pertenecen a la zona (ej. ["riomar", "alto prado"]) */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  keywords?: string[];

  @IsNumber({}, { message: 'La tarifa debe ser un número' })
  @Min(0, { message: 'La tarifa no puede ser negativa' })
  fee: number;

  /** Sede que atiende la zona; null = la sede principal */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all', { message: 'La sede no es válida' })
  branchId?: string | null;
}

export class UpdateDeliveryZoneDto extends PartialType(CreateDeliveryZoneDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
