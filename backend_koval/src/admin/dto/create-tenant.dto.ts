import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Alta de un restaurante (tenant) junto con su dueño, desde el panel SuperAdmin */
export class CreateTenantDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre del restaurante es obligatorio' })
  @MaxLength(100)
  restaurantName: string;

  // Se usa también como subdominio: {slug}.tudominio.com
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, {
    message: 'El slug solo admite minúsculas, números y guiones (sin guion al inicio/final)',
  })
  slug: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre del dueño es obligatorio' })
  @MaxLength(100)
  ownerName: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'El email del dueño no es válido' })
  ownerEmail: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72) // límite de bcrypt
  ownerPassword: string;
}
