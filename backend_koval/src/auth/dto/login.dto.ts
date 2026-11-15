import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @IsNotEmpty({ message: 'El correo es obligatorio' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  password: string;

  /** Código de 6 dígitos de la app de autenticación (solo cuentas con 2FA activo) */
  @IsOptional()
  @IsString()
  @MaxLength(12)
  totpCode?: string;
}
