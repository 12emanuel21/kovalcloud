import { IsBoolean } from 'class-validator';

export class UpdateUserStatusDto {
  @IsBoolean({ message: 'isActive debe ser true o false' })
  isActive: boolean;
}
