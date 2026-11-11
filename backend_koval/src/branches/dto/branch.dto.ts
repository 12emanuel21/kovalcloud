import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsBoolean, IsLatitude, IsLongitude, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateBranchDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la sede es obligatorio' })
  @MaxLength(80)
  name: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'La dirección de la sede es obligatoria' })
  @MaxLength(200)
  address: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  /** Sede principal: recibe los pedidos sin zona y los de recoger sin sede elegida */
  @IsOptional()
  @IsBoolean()
  isMain?: boolean;

  /** Coordenadas de la sede: con ellas el domicilio sale de la sede más cercana al pin del cliente */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsLatitude({ message: 'La latitud no es válida (entre -90 y 90)' })
  latitude?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsLongitude({ message: 'La longitud no es válida (entre -180 y 180)' })
  longitude?: number | null;

  // Tarifa por distancia propia de la sede (null = la de la marca)
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  baseDeliveryFee?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  baseDeliveryKm?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  extraKmFee?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0.5)
  @Max(100)
  maxDeliveryRadiusKm?: number | null;
}

export class UpdateBranchDto extends PartialType(CreateBranchDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
