import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';

export class CreateMenuItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  price: number;

  // Enlace externo (http/https) pegado por el dueño; "" o null quita la foto. Las fotos subidas
  // las asigna POST /restaurants/:id/menu-items/:itemId/image, no este campo.
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'La imagen debe ser un enlace que empiece por http:// o https://' },
  )
  @MaxLength(2048)
  imageUrl?: string | null;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @IsString()
  @IsNotEmpty()
  restaurantId: string;

  @IsString()
  @IsNotEmpty()
  categoryId: string;
}
