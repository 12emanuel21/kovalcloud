import { CHAT_ROLE_MODEL } from '../chats/chat-history';

/**
 * Atajo instantáneo (sin IA) para lo que más se escribe al abrir el chat: un saludo o pedir la
 * carta. Responde en milisegundos con el enlace a la carta en vivo, aunque Gemini esté lento.
 */
export type QuickIntent = 'greeting' | 'menu';

/** "¡Hola!! 👋", "Buenos Días." -> "hola", "buenos dias" (sin tildes, signos ni emojis) */
export function normalizeQuickText(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const GREETINGS = ['hola', 'ola', 'holi', 'buenas', 'buen dia', 'buenos dias', 'buenas tardes', 'buenas noches'];
const GREETING_PHRASES = new Set([...GREETINGS, ...GREETINGS.filter((g) => g !== 'hola').map((g) => `hola ${g}`)]);
const MENU_PHRASES = new Set(['menu', 'carta', 'el menu', 'la carta', 'ver menu', 'ver carta', 'ver el menu', 'ver la carta']);

/**
 * Solo coincidencias exactas del mensaje completo: "hola, quiero 2 perros" no es un saludo simple
 * (lleva un pedido) y sigue a la IA.
 */
export function detectQuickIntent(text: string | null | undefined): QuickIntent | null {
  const normalized = normalizeQuickText(text);
  if (!normalized) return null;
  if (GREETING_PHRASES.has(normalized)) return 'greeting';
  if (MENU_PHRASES.has(normalized)) return 'menu';
  return null;
}

/**
 * ¿El último mensaje del bot es un resumen que espera "sí"? (pedido, adición o pedido nuevo). Con
 * un resumen pendiente, el atajo no responde: el mensaje sigue el flujo normal de confirmación.
 */
export function hasPendingConfirmation(history: Array<{ role: string; message: string }>): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === CHAT_ROLE_MODEL) return /¿Confirmas\?\s*$/.test(history[i].message.trim());
  }
  return false;
}

const DAY_GREETING = { mañana: 'buenos días', tarde: 'buenas tardes', noche: 'buenas noches' } as const;

/** Saludo cordial del local (o la carta, si la pidió) con el enlace a la carta en vivo */
export function buildQuickReply(
  intent: QuickIntent,
  restaurantName: string,
  menuUrl: string,
  dayPart: keyof typeof DAY_GREETING,
): string {
  const link = `📲 Carta en vivo: ${menuUrl}`;
  if (intent === 'menu') {
    return `¡Claro! Aquí tienes nuestra carta con fotos y disponibilidad en tiempo real:\n\n${link}\n\nPuedes armar tu pedido ahí o escribirme aquí qué quieres pedir.`;
  }
  return `¡Hola, ${DAY_GREETING[dayPart]}! 👋 Bienvenido a *${restaurantName}*.\n\n${link}\n\nPuedes pedir desde la carta o escribirme aquí qué se te antoja.`;
}
