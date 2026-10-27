import type { PrismaService } from '../prisma/prisma.service';
import { CHAT_ROLE_AGENT, CHAT_ROLE_SYSTEM } from './chat-history';

/**
 * Handover humano por conversación, sin cambios de esquema: marcadores "system" en ChatHistory
 * (igual que el reset). El último marcador decide; el bot no responde mientras esté pausado.
 */
export const BOT_PAUSED_MARKER = '[SYSTEM_BOT_PAUSED]';
export const BOT_RESUMED_MARKER = '[SYSTEM_BOT_RESUMED]';
export const HANDOVER_MARKERS = [BOT_PAUSED_MARKER, BOT_RESUMED_MARKER];

/** Sin actividad humana durante este tiempo, el bot se reactiva solo (evita un número "mudo" olvidado) */
export const HANDOVER_TTL_MS = 12 * 60 * 60 * 1000;

export interface HandoverState {
  botPaused: boolean;
  /** Cuándo se reactivará solo el bot (null si está activo) */
  resumesAt: Date | null;
}

/**
 * Estado a partir del último marcador y del último mensaje humano: la pausa dura
 * HANDOVER_TTL_MS desde la última actividad del equipo (pausar o escribir).
 */
export function resolveHandover(
  lastMarker: { message: string; createdAt: Date } | null,
  lastAgentMessageAt: Date | null,
  now: Date = new Date(),
): HandoverState {
  if (!lastMarker || lastMarker.message !== BOT_PAUSED_MARKER) return { botPaused: false, resumesAt: null };
  const lastActivity = Math.max(lastMarker.createdAt.getTime(), lastAgentMessageAt?.getTime() ?? 0);
  const resumesAt = new Date(lastActivity + HANDOVER_TTL_MS);
  return resumesAt > now ? { botPaused: true, resumesAt } : { botPaused: false, resumesAt: null };
}

export async function getHandoverState(
  prisma: PrismaService,
  restaurantId: string,
  customerPhone: string,
  now: Date = new Date(),
): Promise<HandoverState> {
  const [lastMarker, lastAgent] = await Promise.all([
    prisma.chatHistory.findFirst({
      where: { restaurantId, customerPhone, role: CHAT_ROLE_SYSTEM, message: { in: HANDOVER_MARKERS } },
      orderBy: { createdAt: 'desc' },
      select: { message: true, createdAt: true },
    }),
    prisma.chatHistory.findFirst({
      where: { restaurantId, customerPhone, role: CHAT_ROLE_AGENT },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);
  return resolveHandover(lastMarker, lastAgent?.createdAt ?? null, now);
}
