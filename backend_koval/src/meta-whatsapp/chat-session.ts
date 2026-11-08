/**
 * Sesión de conversación: tras 3 horas sin mensajes, el cliente que vuelve empieza de cero.
 * Así la IA no reconstruye un carrito abandonado ni intenta confirmar un pedido viejo, y saluda
 * limpio. El historial no se borra (sigue en el Inbox); solo deja de usarse como contexto.
 */
export const CHAT_SESSION_TTL_MS = 3 * 60 * 60 * 1000;

/**
 * Mensajes de la sesión activa (orden cronológico): se recorre hacia atrás desde ahora y se corta
 * en el primer hueco de más de CHAT_SESSION_TTL_MS entre mensajes.
 */
export function activeSessionHistory<T extends { createdAt: Date }>(
  history: T[],
  now: Date = new Date(),
  ttlMs = CHAT_SESSION_TTL_MS,
): T[] {
  let cursor = now.getTime();
  let start = history.length;
  for (let i = history.length - 1; i >= 0; i--) {
    const at = new Date(history[i].createdAt).getTime();
    if (!Number.isFinite(at) || cursor - at > ttlMs) break;
    cursor = at;
    start = i;
  }
  return history.slice(start);
}
