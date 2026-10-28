import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Aviso del microservicio Baileys: línea vinculada (JID o número) o null al desvincularse */
export class SessionNumberDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, { message: 'restaurantId inválido' })
  restaurantId: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phoneNumber?: string | null;
}
