import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateRestaurantDto {
  @IsString()
  @IsNotEmpty()
  name: string; // Ej: "Pizzería Nápoles"

  @IsString()
  @IsNotEmpty()
  slug: string; // Ej: "pizzeria-napoles"

  @IsEmail()
  ownerEmail: string; // Correo del dueño

  @IsString()
  @MinLength(6)
  ownerPassword: string; // Contraseña del dueño

  @IsString()
  @IsNotEmpty()
  planId: string; // "plan-cloud-base" o "plan-on-premise"
}
