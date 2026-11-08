import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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
}

export class UpdateBranchDto extends PartialType(CreateBranchDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
