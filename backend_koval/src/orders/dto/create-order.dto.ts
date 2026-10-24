import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
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
