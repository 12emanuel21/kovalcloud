/**
 * Roles de ChatHistory:
 * - "user": mensaje del cliente.
 * - "model": todo lo que sale del sistema (IA, respuestas rápidas, local cerrado, reset).
 * - "agent": mensaje escrito por el equipo del restaurante desde el Inbox (la IA lo ve como suyo).
 * - "system": marcadores internos; no se envían a la IA ni al cliente.
 */
export const CHAT_ROLE_USER = 'user';
export const CHAT_ROLE_MODEL = 'model';
export const CHAT_ROLE_SYSTEM = 'system';
export const CHAT_ROLE_AGENT = 'agent';

/**
 * El comando `reset` ya no borra el historial (auditoría del Inbox): deja este marcador
 * y la IA solo recibe los mensajes posteriores al último.
 */
export const RESET_CONTEXT_MARKER = '[SYSTEM_RESET_CONTEXT]';
