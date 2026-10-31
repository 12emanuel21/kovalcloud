import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDriverDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del repartidor es obligatorio' })
  @MaxLength(80)
  name: string;

  // Celular con o sin indicativo (3001234567 -> 573001234567); se valida en el servicio
  @IsString()
  @IsNotEmpty({ message: 'El celular del repartidor es obligatorio' })
  @MaxLength(30)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  vehicleInfo?: string | null;
}

export class UpdateDriverDto extends PartialType(CreateDriverDto) {
  // Desactivar en vez de borrar: deja de aparecer en el KDS pero conserva su historial
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
