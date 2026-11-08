import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Edición del dueño de un restaurante desde el panel SuperAdmin: solo los campos enviados */
export class UpdateOwnerDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El nombre del dueño no puede quedar vacío' })
  @MaxLength(100)
  name?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsOptional()
  @IsEmail({}, { message: 'El email del dueño no es válido' })
  email?: string;

  // Nueva contraseña forzada: cierra las sesiones abiertas del dueño
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72) // límite de bcrypt
  password?: string;
}
