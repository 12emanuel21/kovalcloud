import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Cambio de la propia contraseña. currentPassword es obligatoria salvo que la cuenta tenga 2FA
 * y confirme con Sudo Mode (x-sudo-token): una sesión robada no basta para cambiarla.
 */
export class UpdateOwnPasswordDto {
  @IsOptional()
  @IsString()
  @MaxLength(72)
  currentPassword?: string;

  @IsString()
  @MinLength(8, { message: 'La nueva contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72) // límite de bcrypt
  newPassword: string;
}
