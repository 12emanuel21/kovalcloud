import { IsUUID, ValidateIf } from 'class-validator';

/** Sede de una cuenta de cocina; null = ve los pedidos de todas las sedes */
export class UpdateEmployeeBranchDto {
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all', { message: 'La sede no es válida' })
  branchId: string | null;
}
