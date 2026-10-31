import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * POST /orders/:id/dispatch: un repartidor registrado (driverId) o datos sueltos
 * (driverName + driverPhone) para un domiciliario ocasional.
 */
export class DispatchOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  driverId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  driverName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  driverPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  vehicleInfo?: string;

  // Sin minutos, el mensaje al cliente dice "15-20 minutos"
  @IsOptional()
  @IsInt({ message: 'estimatedMinutes debe ser un número entero' })
  @Min(1)
  @Max(240)
  estimatedMinutes?: number;
}
