import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateRestaurantDto {
  @IsString()
  @IsNotEmpty()
  name: string; // Ej: "Pizzería Nápoles"

  @IsString()
  @IsNotEmpty()
  slug: string; // Ej: "pizzeria-napoles"

  @IsOptional()
  @Matches(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, {
    message: 'El subdominio solo admite minúsculas, números y guiones (sin guion al inicio/final)',
  })
  subdomain?: string; // Ej: "pizzeria-napoles" (por defecto = slug)

  @IsEmail()
  ownerEmail: string; // Correo del dueño

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ownerName?: string; // Nombre del dueño (por defecto: "Dueño de {name}")

  @IsString()
  @MinLength(6)
  ownerPassword: string; // Contraseña del dueño

  @IsString()
  @IsNotEmpty()
  planId: string; // "plan-cloud-base" o "plan-on-premise"
}
