import { Logger } from '@nestjs/common';
import { OrderType } from '@prisma/client';
import { normalizePlace, type DeliveryQuote } from '../delivery-zones/delivery-coverage';

/** Sede activa del restaurante, lo mínimo para enrutar un pedido */
export interface RoutableBranch {
  id: string;
  isMain: boolean;
  /** Para emparejar la sede que dice el cliente por WhatsApp */
  name?: string;
}

export interface BranchRoutingInput {
  orderType: OrderType | string | null | undefined;
  /** Cotización del domicilio (null si no es DELIVERY) */
  quote: DeliveryQuote | null | undefined;
  /** Sede elegida por el cliente (recoger / mesa) */
  requestedBranchId?: string | null;
  /** Sedes ACTIVAS del restaurante */
  branches: RoutableBranch[];
}

/** Sede principal; si ninguna está marcada (no debería pasar), null */
export const mainBranchOf = (branches: RoutableBranch[]): RoutableBranch | null =>
  branches.find((branch) => branch.isMain) ?? null;

/**
 * Qué sede prepara el pedido (la que lo verá en su KDS):
 * - el restaurante no tiene sedes: null (comportamiento de siempre);
 * - DELIVERY: la sede de la zona del barrio; si la zona no tiene sede, o aplica la tarifa estándar
 *   ("Tarifa general") o no hay cobertura configurada: la sede principal;
 * - TAKEAWAY / DINE_IN: la sede que eligió el cliente, o la principal.
 * Una sede inexistente o inactiva nunca se asigna: cae en la principal.
 */
export function resolveOrderBranchId({ orderType, quote, requestedBranchId, branches }: BranchRoutingInput): string | null {
  if (branches.length === 0) return null;
  const isActive = (id: string | null | undefined): id is string => Boolean(id) && branches.some((b) => b.id === id);
  const mainId = mainBranchOf(branches)?.id ?? null;

  if ((orderType ?? OrderType.DELIVERY) === OrderType.DELIVERY) {
    const zoneBranchId = quote?.isCovered ? quote.branchId : null;
    return isActive(zoneBranchId) ? zoneBranchId : mainId;
  }
  return isActive(requestedBranchId) ? requestedBranchId : mainId;
}

type BranchFinder = {
  branch: {
    findMany(args: {
      where: { restaurantId: string; isActive: true };
      select: { id: true; isMain: true; name: true };
    }): Promise<RoutableBranch[]>;
  };
};

const logger = new Logger('BranchRouting');

/**
 * Sedes activas del restaurante. Si la consulta falla, se sigue sin sede (el dueño ve el pedido en
 * su tablero): un error de enrutamiento nunca debe hacer perder un pedido.
 */
export async function activeBranchesOf(prisma: BranchFinder, restaurantId: string): Promise<RoutableBranch[]> {
  try {
    return (
      (await prisma.branch.findMany({
        where: { restaurantId, isActive: true },
        select: { id: true, isMain: true, name: true },
      })) ?? []
    );
  } catch (error: any) {
    logger.warn(`No se pudieron cargar las sedes de ${restaurantId}; el pedido queda sin sede: ${error?.message || error}`);
    return [];
  }
}

/** Palabras que no distinguen una sede de otra ("la de la 60" -> "60") */
const BRANCH_STOPWORDS = new Set(['la', 'el', 'las', 'los', 'de', 'del', 'en', 'a', 'y', 'por', 'sede', 'local', 'favor', 'porfa', 'que', 'queda']);

const significantWords = (text: string) => normalizePlace(text).split(' ').filter((word) => word && !BRANCH_STOPWORDS.has(word));

/**
 * Sede que nombró el cliente (la IA devuelve el nombre, idealmente exacto): primero la coincidencia
 * exacta sin tildes ni mayúsculas; si no, la sede con más palabras en común con lo que dijo
 * ("la de la 60" -> "Calle 60"). Empate, nada en común o texto vacío: null (va a la principal).
 */
export function matchBranchByName<T extends RoutableBranch>(branches: T[], spoken: string | null | undefined): T | null {
  const said = normalizePlace(spoken);
  if (!said) return null;
  const exact = branches.find((branch) => normalizePlace(branch.name) === said);
  if (exact) return exact;

  const saidWords = new Set(significantWords(said));
  let best: T | null = null;
  let bestScore = 0;
  let tie = false;
  for (const branch of branches) {
    const score = significantWords(branch.name ?? '').filter((word) => saidWords.has(word)).length;
    if (score > bestScore) {
      best = branch;
      bestScore = score;
      tie = false;
    } else if (score > 0 && score === bestScore) {
      tie = true;
    }
  }
  return bestScore > 0 && !tie ? best : null;
}
