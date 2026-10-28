import { PartialType } from '@nestjs/mapped-types';
import { CreateRestaurantDto } from './create-restaurant.dto';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
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

  @IsOptional()
  @IsString()
  bannerUrl?: string;

  @IsOptional()
  @IsString()
  currency?: string;

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
