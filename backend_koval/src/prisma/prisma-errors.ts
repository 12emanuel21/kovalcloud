import { Prisma } from '@prisma/client';

/**
 * P2025: el `update` con condición (ej. `where: { id, dispatchedAt: null }`) no encontró la fila.
 * Es como un `updateMany` con count 0, pero devuelve la fila (con su include) en la misma sentencia.
 */
export function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

/** P2002: violación de un índice único */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
