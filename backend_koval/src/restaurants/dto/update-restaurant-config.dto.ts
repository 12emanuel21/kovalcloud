import { IsBoolean, IsIn, IsObject, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { MENU_THEMES, type MenuTheme } from '../menu-themes';

/**
 * Configuración operativa del local (Ajustes > Perfil del Local).
 * Campos ausentes no se tocan; un texto vacío o null borra el valor.
 * businessHours se valida en el servicio (parseBusinessHours).
 */
export class UpdateRestaurantConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  paymentDetails?: string | null;

  @IsOptional()
  @IsObject()
  businessHours?: Record<string, unknown> | null;

  @IsOptional()
  @IsBoolean()
  isTemporarilyClosed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  closedMessage?: string | null;

  @IsOptional()
  @IsIn(MENU_THEMES, { message: `El tema debe ser uno de: ${MENU_THEMES.join(', ')}` })
  theme?: MenuTheme;

  // ── Wompi ──
  // Interruptor manual: con false la carta no ofrece "Pagar en línea" aunque haya llaves
  @IsOptional()
  @IsBoolean()
  isWompiEnabled?: boolean;

  // Llave pública: vacío o null = quitar. Secretos: ausente o "" = no cambiar (el formulario no
  // conoce el valor guardado); null = borrar. Los prefijos evitan pegar una llave en el campo equivocado.
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @Matches(/^pub_(test|prod)_\S+$/, { message: 'La llave pública de Wompi empieza por pub_test_ o pub_prod_' })
  wompiPublicKey?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @Matches(/^prv_(test|prod)_\S+$/, { message: 'La llave privada de Wompi empieza por prv_test_ o prv_prod_' })
  wompiPrivateKey?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @Matches(/^(test|prod)_events_\S+$/, { message: 'El secreto de eventos de Wompi empieza por test_events_ o prod_events_' })
  wompiEventSecret?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @Matches(/^(test|prod)_integrity_\S+$/, {
    message: 'El secreto de integridad de Wompi empieza por test_integrity_ o prod_integrity_',
  })
  wompiIntegritySecret?: string | null;
}
