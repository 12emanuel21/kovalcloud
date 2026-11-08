import { NotFoundException } from '@nestjs/common';

type BranchLookup = {
  branch: { findFirst(args: { where: { id: string; restaurantId: string }; select: { id: true } }): Promise<unknown> };
};

/**
 * Valida que la sede que se asigna a una zona, repartidor o cocina sea del mismo restaurante.
 * undefined = no se cambia; null = sin sede (no hay nada que validar).
 */
export async function assertBranchOf(prisma: BranchLookup, restaurantId: string, branchId: string | null | undefined) {
  if (branchId === undefined || branchId === null) return;
  const branch = await prisma.branch.findFirst({ where: { id: branchId, restaurantId }, select: { id: true } });
  if (!branch) throw new NotFoundException('Sede no encontrada');
}

/** Solo incluye branchId en el data de Prisma cuando viene en la petición */
export const branchData = (branchId: string | null | undefined) => (branchId === undefined ? {} : { branchId });
