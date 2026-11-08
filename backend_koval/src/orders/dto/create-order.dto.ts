import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
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
  tableNumber?: string;

  @IsString()
  @IsOptional()
  channel?: string;

  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsString()
  @IsNotEmpty()
  customerPhone: string;

  @IsString()
  @IsOptional()
  deliveryAddress?: string;

  /** Barrio del domicilio: define la zona de cobertura y el flete */
  @IsString()
  @IsOptional()
  @MaxLength(120)
  neighborhood?: string;

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
  notes?: string;

  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  /** Cómo paga el cliente: WOMPI (en línea, devuelve wompiCheckoutUrl) o CASH (contra entrega). Por defecto CASH. */
  @IsOptional()
  @IsIn(ORDER_PAYMENT_METHODS, { message: `paymentMethod debe ser uno de: ${ORDER_PAYMENT_METHODS.join(', ')}` })
  paymentMethod?: OrderPaymentMethod;
}
