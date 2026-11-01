import { IsString, MaxLength, MinLength } from 'class-validator';

/** Nueva contraseña de una cuenta de cocina (la fija el OWNER o el SUPERADMIN) */
export class UpdateEmployeePasswordDto {
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72) // límite de bcrypt
  password: string;
}
