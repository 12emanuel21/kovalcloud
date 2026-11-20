import { Logger } from '@nestjs/common';
import { OrderType } from '@prisma/client';
import { normalizePlace, type DeliveryQuote } from '../delivery-zones/delivery-coverage';

/** Sede activa del restaurante, lo mínimo para enrutar un pedido */
export interface RoutableBranch {
  id: string;
  isMain: boolean;
  /** Para emparejar la sede que dice el cliente por WhatsApp */
  name?: string;
  /** Se muestra al cliente para que elija la sede (y sirve para reconocerla: "la de la 38") */
  address?: string | null;
  /** Coordenadas (domicilio por distancia) */
  latitude?: number | null;
  longitude?: number | null;
}

export interface BranchRoutingInput {
  orderType: OrderType | string | null | undefined;
  /** Cotización del domicilio (motor de zonas, hoy desconectado: siempre null) */
  quote: DeliveryQuote | null | undefined;
  /** Sede elegida por el cliente (bot o carta), para cualquier tipo de pedido */
  requestedBranchId?: string | null;
  /** Sedes ACTIVAS del restaurante */
  branches: RoutableBranch[];
}

/**
 * Sede de respaldo: la principal; si ninguna activa está marcada como principal, la primera activa
 * (activeBranchesOf las ordena: principal primero y luego por nombre). Sin sedes: null.
 */
export const mainBranchOf = <T extends RoutableBranch>(branches: T[]): T | null =>
  branches.find((branch) => branch.isMain) ?? branches[0] ?? null;

/**
 * Qué sede prepara el pedido (la que lo verá en su KDS):
 * - el restaurante no tiene sedes activas: null (comportamiento de un solo local);
 * - la sede que eligió el cliente (bot o carta), en domicilio, recoger o mesa;
 * - si no eligió: en domicilio, la de la zona del barrio (motor de zonas, hoy desconectado);
 * - y si no, la principal o, sin principal activa, la primera sede activa.
 * Con sedes activas nunca devuelve null, y una sede inexistente o inactiva nunca se asigna.
 */
export function resolveOrderBranchId({ orderType, quote, requestedBranchId, branches }: BranchRoutingInput): string | null {
  if (branches.length === 0) return null;
  const isActive = (id: string | null | undefined): id is string => Boolean(id) && branches.some((b) => b.id === id);
  if (isActive(requestedBranchId)) return requestedBranchId;

  if ((orderType ?? OrderType.DELIVERY) === OrderType.DELIVERY) {
    const zoneBranchId = quote?.isCovered ? quote.branchId : null;
    if (isActive(zoneBranchId)) return zoneBranchId;
  }
  return mainBranchOf(branches)?.id ?? null;
}

type BranchFinder = {
  branch: {
    findMany(args: {
      where: { restaurantId: string; isActive: true };
      orderBy: Array<{ isMain: 'desc' } | { name: 'asc' }>;
      select: { id: true; isMain: true; name: true; address: true; latitude: true; longitude: true };
    }): Promise<RoutableBranch[]>;
  };
};

const logger = new Logger('BranchRouting');

/**
 * Sedes activas del restaurante, en el orden en que se le muestran al cliente (la principal primero,
 * luego por nombre, igual que la carta web). Si la consulta falla, se sigue sin sede (el dueño ve el
 * pedido en su tablero): un error de enrutamiento nunca debe hacer perder un pedido.
 */
export async function activeBranchesOf(prisma: BranchFinder, restaurantId: string): Promise<RoutableBranch[]> {
  try {
    return (
      (await prisma.branch.findMany({
        where: { restaurantId, isActive: true },
        orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
        select: { id: true, isMain: true, name: true, address: true, latitude: true, longitude: true },
      })) ?? []
    );
  } catch (error: any) {
    logger.warn(`No se pudieron cargar las sedes de ${restaurantId}; el pedido queda sin sede: ${error?.message || error}`);
    return [];
  }
}

/** Palabras que no distinguen una sede de otra ("la de la 60" -> "60") */
const BRANCH_STOPWORDS = new Set(['la', 'el', 'las', 'los', 'de', 'del', 'en', 'a', 'y', 'por', 'sede', 'local', 'favor', 'porfa', 'que', 'queda']);

const significantWords = (text: string | null | undefined) =>
  normalizePlace(text).split(' ').filter((word) => word && !BRANCH_STOPWORDS.has(word));

/** "38" dicho por el cliente reconoce el "38a" de una dirección ("Cra. 38a #75B-10") */
const sameWord = (said: string, word: string) =>
  said === word || (/^\d+$/.test(said) && word.length === said.length + 1 && word.startsWith(said) && /[a-zñ]$/.test(word));

/** La sede con más palabras en común con lo que dijo el cliente; empate o nada en común: null */
function bestMatch<T>(branches: T[], saidWords: string[], wordsOf: (branch: T) => string[]): T | null {
  let best: T | null = null;
  let bestScore = 0;
  let tie = false;
  for (const branch of branches) {
    const words = wordsOf(branch);
    const score = saidWords.filter((said) => words.some((word) => sameWord(said, word))).length;
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

/**
 * Sede que nombró el cliente (la IA devuelve el nombre, idealmente exacto): primero la coincidencia
 * exacta sin tildes ni mayúsculas; si no, la sede con más palabras en común con su nombre ("la de la
 * 60" -> "Calle 60", "la 2" -> "Sede 2") y, si el nombre no alcanza, con su dirección ("la de la 38"
 * -> la sede de la "Cra. 38a #75B-10"). Empate, nada en común o texto vacío: null.
 */
export function matchBranchByName<T extends RoutableBranch>(branches: T[], spoken: string | null | undefined): T | null {
  const said = normalizePlace(spoken);
  if (!said) return null;
  const exact = branches.find((branch) => normalizePlace(branch.name) === said);
  if (exact) return exact;

  const saidWords = [...new Set(significantWords(said))];
  return (
    bestMatch(branches, saidWords, (branch) => significantWords(branch.name)) ??
    bestMatch(branches, saidWords, (branch) => significantWords(branch.address))
  );
}
