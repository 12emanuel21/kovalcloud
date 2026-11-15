import { DisconnectReason } from '@whiskeysockets/baileys';

/**
 * Reglas de la sesión de WhatsApp Web separadas del socket (se prueban sin conectar):
 * qué mensajes son viejos para responderlos y cómo/cuándo reintentar la conexión.
 */

/** Tras una reconexión WhatsApp entrega lo pendiente: más viejo que esto no se responde */
export const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;

export const RECONNECT_BASE_DELAY_MS = 3000;
export const RECONNECT_MAX_DELAY_MS = 60_000;

/** messageTimestamp de Baileys: segundos, como number o Long (protobuf) */
type ProtoTimestamp = number | { toNumber(): number } | null | undefined;

/** Fecha del mensaje en ms; null si no viene (no se descarta por antigüedad) */
export function messageTimestampMs(timestamp: ProtoTimestamp): number | null {
  if (timestamp === null || timestamp === undefined) return null;
  const seconds = typeof timestamp === 'number' ? timestamp : Number(timestamp.toNumber());
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

/** ¿Llegó con más de MAX_MESSAGE_AGE_MS de retraso? (evita responder en ráfaga chats de hace horas) */
export function isStaleMessage(timestamp: ProtoTimestamp, now: number = Date.now(), maxAgeMs = MAX_MESSAGE_AGE_MS): boolean {
  const at = messageTimestampMs(timestamp);
  return at !== null && now - at > maxAgeMs;
}

/** Espera antes del reintento N (0, 1, 2...): 3 s, 6 s, 12 s, 24 s, 48 s y luego 60 s */
export function reconnectDelayMs(attempt: number): number {
  const exponent = Math.max(0, Math.floor(attempt));
  return Math.min(RECONNECT_BASE_DELAY_MS * 2 ** exponent, RECONNECT_MAX_DELAY_MS);
}

/**
 * Cierres en los que reintentar no sirve: sesión cerrada desde el teléfono (401), número
 * bloqueado/prohibido (403) o la sesión se abrió en otro lado (440). Reintentar en bucle con un
 * número bloqueado o duplicado empeora el bloqueo; el dueño reconecta desde el Dashboard.
 */
export function isPermanentDisconnect(statusCode: number | undefined): boolean {
  return (
    statusCode === DisconnectReason.loggedOut ||
    statusCode === DisconnectReason.forbidden ||
    statusCode === DisconnectReason.connectionReplaced
  );
}
