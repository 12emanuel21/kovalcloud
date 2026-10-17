import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Largo máximo del snippet del último mensaje en la bandeja */
const SNIPPET_LENGTH = 160;

/** customerPhone guarda solo dígitos (Meta wa_id / Baileys sin sufijo @s.whatsapp.net) */
const PHONE_PATTERN = /^\d{3,32}$/;

export interface ConversationSummary {
  customerPhone: string;
  lastMessage: string;
  lastRole: string; // "user" (cliente) | "model" (bot)
  lastMessageAt: Date;
  messageCount: number;
}

/**
 * Bandeja de chats de WhatsApp (lectura de ChatHistory).
 * El acceso por restaurante lo valida TenantGuard en el controlador.
 */
@Injectable()
export class ChatsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Conversaciones del restaurante (una por teléfono), de la más reciente a la más antigua */
  async listConversations(restaurantId: string): Promise<ConversationSummary[]> {
    // DISTINCT ON: último mensaje de cada teléfono en una sola consulta (parametrizada)
    const [lastMessages, counts] = await Promise.all([
      this.prisma.$queryRaw<Array<{ customerPhone: string; message: string; role: string; createdAt: Date }>>`
        SELECT DISTINCT ON ("customerPhone") "customerPhone", "message", "role", "createdAt"
        FROM "ChatHistory"
        WHERE "restaurantId" = ${restaurantId}
        ORDER BY "customerPhone", "createdAt" DESC
      `,
      this.prisma.chatHistory.groupBy({
        by: ['customerPhone'],
        where: { restaurantId },
        _count: { _all: true },
      }),
    ]);

    const countByPhone = new Map(counts.map((c) => [c.customerPhone, c._count._all]));
    return lastMessages
      .map((row) => ({
        customerPhone: row.customerPhone,
        lastMessage: row.message.length > SNIPPET_LENGTH ? `${row.message.slice(0, SNIPPET_LENGTH)}…` : row.message,
        lastRole: row.role,
        lastMessageAt: row.createdAt,
        messageCount: countByPhone.get(row.customerPhone) ?? 0,
      }))
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
  }

  /** Historial completo de un teléfono en el restaurante, en orden cronológico */
  async getConversation(restaurantId: string, customerPhone: string) {
    if (!PHONE_PATTERN.test(customerPhone)) {
      throw new BadRequestException('El teléfono debe contener solo dígitos');
    }
    return this.prisma.chatHistory.findMany({
      where: { restaurantId, customerPhone },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, message: true, createdAt: true },
    });
  }
}
