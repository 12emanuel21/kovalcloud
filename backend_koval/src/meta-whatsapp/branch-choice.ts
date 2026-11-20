/**
 * Elegir la sede por WhatsApp (marcas con 2 o más sedes activas): el cliente ve cada sede con su
 * dirección y dice a cuál envía su pedido. Lo usan el prompt (para que la IA pregunte) y el backend
 * (que no confirma ni registra un pedido sin sede elegida).
 */

/** Sede tal como se le muestra al cliente */
export interface BranchOption {
  name?: string | null;
  address?: string | null;
}

export const BRANCH_QUESTION = '¿A cuál de nuestras sedes deseas enviar tu pedido?';
/** Una reserva de mesa no se "envía": el cliente va a la sede */
export const RESERVATION_BRANCH_QUESTION = '¿En cuál de nuestras sedes deseas tu reserva?';

/** Nombre y dirección los escribe el dueño: en una sola línea, sin saltos que rompan la lista */
const oneLine = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

const shownBranches = (branches: BranchOption[]) =>
  branches.map((branch) => ({ name: oneLine(branch.name), address: oneLine(branch.address) })).filter((branch) => branch.name);

/** "• Sede 1: Cra. 38a #75B-10", una sede por línea, en el orden de activeBranchesOf (principal primero) */
export function formatBranchList(branches: BranchOption[]): string {
  return shownBranches(branches)
    .map(({ name, address }) => (address ? `• ${name}: ${address}` : `• ${name}`))
    .join('\n');
}

export const branchQuestionFor = (orderType: string | null | undefined) =>
  orderType === 'DINE_IN' ? RESERVATION_BRANCH_QUESTION : BRANCH_QUESTION;

/**
 * Mensaje del backend cuando la IA dio el pedido por listo (o el cliente aceptó) sin sede elegida:
 * en vez del resumen, la lista de sedes con su dirección y la pregunta.
 */
export function buildBranchQuestion(branches: BranchOption[], orderType: string | null | undefined): string {
  return `Antes de confirmar, estas son nuestras sedes:\n${formatBranchList(branches)}\n\n${branchQuestionFor(orderType)}`;
}

/**
 * Si la IA hizo la pregunta de la sede pero no mostró todas las sedes con su dirección, se agrega la
 * lista justo antes de la pregunta (el cliente necesita las direcciones para elegir).
 */
export function withBranchList(response: string, branches: BranchOption[]): string {
  const question = [BRANCH_QUESTION, RESERVATION_BRANCH_QUESTION].find((q) => response.includes(q));
  if (!question) return response;
  const listed = shownBranches(branches).every(
    ({ name, address }) => response.includes(name) && (!address || response.includes(address)),
  );
  if (listed) return response;
  const [before, ...after] = response.split(question);
  return [before.trim(), formatBranchList(branches), `${question}${after.join(question)}`.trim()].filter(Boolean).join('\n\n');
}
