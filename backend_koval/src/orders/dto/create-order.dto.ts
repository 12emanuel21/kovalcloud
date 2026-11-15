import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus, OrderType } from '@prisma/client';

export const ORDER_PAYMENT_METHODS = ['WOMPI', 'CASH'] as const;
export type OrderPaymentMethod = (typeof ORDER_PAYMENT_METHODS)[number];

/** Canal de los pedidos de la carta web (POST /orders, público). El bot crea los suyos como WHATSAPP. */
export const WEB_MENU_CHANNEL = 'WEB_MENU';

/** ¿Pedido de la carta web? (WEB se acepta como alias) */
export const isWebMenuChannel = (channel: string | null | undefined) => channel === WEB_MENU_CHANNEL || channel === 'WEB';

/** Topes del endpoint público: un pedido real no se acerca, y evitan payloads gigantes */
export const ORDER_LIMITS = {
  customerName: 100,
  deliveryAddress: 250,
  notes: 500,
  tableNumber: 30,
  items: 50,
} as const;

export class CreateOrderItemDto {
  @IsString()
  @IsNotEmpty()
  menuItemId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @IsOptional()
  unitPrice?: number;
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  restaurantId: string;

  @IsEnum(OrderType)
  @IsOptional()
  orderType?: OrderType;

  @IsString()
  @IsOptional()
  @MaxLength(ORDER_LIMITS.tableNumber, { message: `La mesa admite máximo ${ORDER_LIMITS.tableNumber} caracteres` })
  tableNumber?: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  channel?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(ORDER_LIMITS.customerName, { message: `El nombre admite máximo ${ORDER_LIMITS.customerName} caracteres` })
  customerName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  customerPhone: string;

  @IsString()
  @IsOptional()
  @MaxLength(ORDER_LIMITS.deliveryAddress, { message: `La dirección admite máximo ${ORDER_LIMITS.deliveryAddress} caracteres` })
  deliveryAddress?: string;

  /** Barrio del domicilio: define la zona de cobertura y el flete */
  @IsString()
  @IsOptional()
  @MaxLength(120)
  neighborhood?: string;

  /** Pin GPS del cliente ("Usar mi ubicación actual"): el envío se cobra por distancia */
  @IsOptional()
  @IsLatitude({ message: 'La latitud no es válida' })
  customerLat?: number;

  @IsOptional()
  @IsLongitude({ message: 'La longitud no es válida' })
  customerLng?: number;

  /** Sede elegida para recoger (o la mesa); los domicilios se enrutan por la zona del barrio */
  @IsOptional()
  @IsUUID('all', { message: 'La sede no es válida' })
  branchId?: string;

  /** El cliente autorizó el tratamiento de sus datos (Ley 1581) en el checkout */
  @IsBoolean()
  @IsOptional()
  acceptTerms?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(ORDER_LIMITS.notes, { message: `Las notas admiten máximo ${ORDER_LIMITS.notes} caracteres` })
  notes?: string;

  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @IsArray()
  @ArrayMaxSize(ORDER_LIMITS.items, { message: `El pedido admite máximo ${ORDER_LIMITS.items} productos distintos` })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  /** Cómo paga el cliente: WOMPI (en línea, devuelve wompiCheckoutUrl) o CASH (contra entrega). Por defecto CASH. */
  @IsOptional()
  @IsIn(ORDER_PAYMENT_METHODS, { message: `paymentMethod debe ser uno de: ${ORDER_PAYMENT_METHODS.join(', ')}` })
  paymentMethod?: OrderPaymentMethod;
}
