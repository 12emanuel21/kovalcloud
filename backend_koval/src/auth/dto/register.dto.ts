import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @IsNotEmpty({ message: 'El correo es obligatorio' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(Role, { message: 'El rol especificado no es válido' })
  @IsOptional()
  role?: Role;

  // Obligatorio para OWNER; debe omitirse para SUPERADMIN
  @IsUUID('4', { message: 'restaurantId no es un UUID válido' })
  @IsOptional()
  restaurantId?: string;
}
