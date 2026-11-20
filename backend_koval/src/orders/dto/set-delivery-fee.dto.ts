import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { MAX_DELIVERY_FEE } from '../delivery-fee';

/** PATCH /orders/:id/delivery-fee: valor del domicilio (pesos enteros) y, opcional, la sede que lo prepara */
export class SetDeliveryFeeDto {
  @IsInt({ message: 'El valor del domicilio debe ser un número entero de pesos' })
  @Min(0, { message: 'El valor del domicilio debe ser 0 (gratis) o mayor' })
  @Max(MAX_DELIVERY_FEE, { message: 'El valor del domicilio es demasiado alto' })
  deliveryFee: number;

  @IsOptional()
  @IsUUID('all', { message: 'La sede no es válida' })
  branchId?: string;
}
