import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { CUSTOM_INSTRUCTIONS_MAX_LENGTH } from '../custom-instructions';
import { CreateRestaurantDto } from './create-restaurant.dto';
import { IsIn, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import {
  HEX_COLOR_PATTERN,
  MENU_COLOR_MODES,
  MENU_FONTS,
  MENU_LAYOUTS,
  MENU_THEMES,
  type MenuColorMode,
  type MenuFont,
  type MenuLayout,
  type MenuTheme,
} from '../menu-themes';

export class UpdateRestaurantDto extends PartialType(CreateRestaurantDto) {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  // Portada del hero de la carta: enlace http(s) o foto subida (POST /restaurants/:id/banner).
  // null o "" la quita
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  @MaxLength(2048)
  @Matches(/^(https?:\/\/\S+|\/uploads\/menu\/[0-9a-f-]{36}\.(jpg|png|webp))$/i, {
    message: 'La portada debe ser un enlace que empiece por http:// o https://',
  })
  bannerUrl?: string | null;

  @IsOptional()
  @IsString()
  currency?: string;

  // Tarifa estándar de domicilio (COP) para barrios fuera de las zonas; null la quita
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber({}, { message: 'La tarifa estándar debe ser un número' })
  @Min(0, { message: 'La tarifa estándar no puede ser negativa' })
  @Max(1_000_000, { message: 'La tarifa estándar es demasiado alta' })
  defaultDeliveryFee?: number | null;

  // Instrucciones especiales del local (reglas en español para el asistente). Se recortan los
  // espacios antes de validar el máximo; "" o null las borran
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Las instrucciones deben ser texto' })
  @MaxLength(CUSTOM_INSTRUCTIONS_MAX_LENGTH, {
    message: `Las instrucciones pueden tener máximo ${CUSTOM_INSTRUCTIONS_MAX_LENGTH} caracteres`,
  })
  customInstructions?: string | null;

  // Domicilio por distancia: coordenadas del local (null las quita y se apaga el cálculo por distancia)
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsLatitude({ message: 'La latitud no es válida (entre -90 y 90)' })
  latitude?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsLongitude({ message: 'La longitud no es válida (entre -180 y 180)' })
  longitude?: number | null;

  @IsOptional()
  @IsNumber({}, { message: 'La tarifa base debe ser un número' })
  @Min(0, { message: 'La tarifa base no puede ser negativa' })
  @Max(1_000_000, { message: 'La tarifa base es demasiado alta' })
  baseDeliveryFee?: number;

  @IsOptional()
  @IsNumber({}, { message: 'La distancia base debe ser un número' })
  @Min(0, { message: 'La distancia base no puede ser negativa' })
  @Max(100, { message: 'La distancia base es demasiado alta' })
  baseDeliveryKm?: number;

  @IsOptional()
  @IsNumber({}, { message: 'El valor del km adicional debe ser un número' })
  @Min(0, { message: 'El valor del km adicional no puede ser negativo' })
  @Max(1_000_000, { message: 'El valor del km adicional es demasiado alto' })
  extraKmFee?: number;

  @IsOptional()
  @IsNumber({}, { message: 'El radio máximo debe ser un número' })
  @Min(0.5, { message: 'El radio máximo debe ser de al menos 0,5 km' })
  @Max(100, { message: 'El radio máximo es demasiado alto' })
  maxDeliveryRadiusKm?: number;

  @IsOptional()
  @IsString()
  botpressBotId?: string;

  @IsOptional()
  @IsString()
  whatsappToken?: string;

  @IsOptional()
  @IsString()
  whatsappPhoneId?: string;

  @IsOptional()
  @IsString()
  whatsappWabaId?: string;

  @IsOptional()
  @IsString()
  whatsappVerifyToken?: string;

  // BYOA: App Secret de la app de Meta del restaurante (solo escritura, nunca se devuelve)
  @IsOptional()
  @IsString()
  metaAppSecret?: string;

  // Tema visual de la carta pública (Ajustes > Perfil > "Tema Visual de la Carta Digital")
  @IsOptional()
  @IsString()
  @IsIn(MENU_THEMES, { message: `El tema debe ser uno de: ${MENU_THEMES.join(', ')}` })
  theme?: MenuTheme;

  // Modo claro / oscuro con el que abre la carta (el cliente puede cambiarlo con el botón ☀️/🌙)
  @IsOptional()
  @IsIn(MENU_COLOR_MODES, { message: 'El modo de la carta debe ser light o dark' })
  menuColorMode?: MenuColorMode;

  // Estructura del menú: cuadrícula visual o lista compacta estilo delivery
  @IsOptional()
  @IsIn(MENU_LAYOUTS, { message: `La estructura debe ser una de: ${MENU_LAYOUTS.join(', ')}` })
  layout?: MenuLayout;

  // Color de acento propio (#RRGGBB). null = volver al color del tema
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_PATTERN, { message: 'El color debe tener el formato #RRGGBB' })
  customColor?: string | null;

  // Tipografía de la carta pública
  @IsOptional()
  @IsIn(MENU_FONTS, { message: `La tipografía debe ser una de: ${MENU_FONTS.join(', ')}` })
  fontFamily?: MenuFont;
}
