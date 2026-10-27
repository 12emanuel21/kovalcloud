import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetaWhatsAppService } from '../meta-whatsapp/meta-whatsapp.service';
import { CHAT_ROLE_AGENT, CHAT_ROLE_SYSTEM, CHAT_ROLE_USER } from './chat-history';
import {
  BOT_PAUSED_MARKER,
  BOT_RESUMED_MARKER,
  HANDOVER_MARKERS,
  getHandoverState,
  resolveHandover,
  type HandoverState,
} from './handover';

/** Largo máximo del snippet del último mensaje en la bandeja */
const SNIPPET_LENGTH = 160;

/** customerPhone guarda solo dígitos (Meta wa_id / Baileys sin sufijo @s.whatsapp.net) */
const PHONE_PATTERN = /^\d{3,32}$/;

/** Meta solo permite mensajes libres hasta 24 h después del último mensaje del cliente */
const META_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ConversationSummary {
  customerPhone: string;
  lastMessage: string;
  lastRole: string; // "user" (cliente) | "model" (bot) | "agent" (equipo)
  lastMessageAt: Date;
  messageCount: number;
  botPaused: boolean;
}

export interface ConversationStatus extends HandoverState {
  channel: 'META' | 'BAILEYS';
  /** Último mensaje del cliente (ventana de 24 h de Meta) */
  lastCustomerMessageAt: Date | null;
  /** Con Meta, pasada la ventana de 24 h la API rechaza mensajes libres */
  outsideMetaWindow: boolean;
}

/**
 * Bandeja de chats de WhatsApp (ChatHistory) e intervención humana: envío manual y pausa del bot.
 * El acceso por restaurante lo valida TenantGuard en el controlador.
 */
@Injectable()
export class ChatsService {
  private readonly logger = new Logger(ChatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: MetaWhatsAppService,
  ) {}

  private assertPhone(customerPhone: string) {
    if (!PHONE_PATTERN.test(customerPhone)) {
      throw new BadRequestException('El teléfono debe contener solo dígitos');
    }
  }

  /** Conversaciones del restaurante (una por teléfono), de la más reciente a la más antigua */
  async listConversations(restaurantId: string): Promise<ConversationSummary[]> {
    // DISTINCT ON: último mensaje / marcador de cada teléfono en una sola consulta (parametrizada).
    // Los marcadores "system" no son mensajes: no cuentan para el snippet ni el total.
    const [lastMessages, counts, lastMarkers, lastAgentMessages] = await Promise.all([
      this.prisma.$queryRaw<Array<{ customerPhone: string; message: string; role: string; createdAt: Date }>>`
        SELECT DISTINCT ON ("customerPhone") "customerPhone", "message", "role", "createdAt"
        FROM "ChatHistory"
        WHERE "restaurantId" = ${restaurantId} AND "role" <> ${CHAT_ROLE_SYSTEM}
        ORDER BY "customerPhone", "createdAt" DESC
      `,
      this.prisma.chatHistory.groupBy({
        by: ['customerPhone'],
        where: { restaurantId, role: { not: CHAT_ROLE_SYSTEM } },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<Array<{ customerPhone: string; message: string; createdAt: Date }>>`
        SELECT DISTINCT ON ("customerPhone") "customerPhone", "message", "createdAt"
        FROM "ChatHistory"
        WHERE "restaurantId" = ${restaurantId} AND "role" = ${CHAT_ROLE_SYSTEM}
          AND "message" IN (${HANDOVER_MARKERS[0]}, ${HANDOVER_MARKERS[1]})
        ORDER BY "customerPhone", "createdAt" DESC
      `,
      this.prisma.$queryRaw<Array<{ customerPhone: string; createdAt: Date }>>`
        SELECT DISTINCT ON ("customerPhone") "customerPhone", "createdAt"
        FROM "ChatHistory"
        WHERE "restaurantId" = ${restaurantId} AND "role" = ${CHAT_ROLE_AGENT}
        ORDER BY "customerPhone", "createdAt" DESC
      `,
    ]);

    const countByPhone = new Map(counts.map((c) => [c.customerPhone, c._count._all]));
    const markerByPhone = new Map(lastMarkers.map((m) => [m.customerPhone, m]));
    const agentByPhone = new Map(lastAgentMessages.map((a) => [a.customerPhone, a.createdAt]));
    const now = new Date();
    return lastMessages
      .map((row) => ({
        customerPhone: row.customerPhone,
        lastMessage: row.message.length > SNIPPET_LENGTH ? `${row.message.slice(0, SNIPPET_LENGTH)}…` : row.message,
        lastRole: row.role,
        lastMessageAt: row.createdAt,
        messageCount: countByPhone.get(row.customerPhone) ?? 0,
        botPaused: resolveHandover(
          markerByPhone.get(row.customerPhone) ?? null,
          agentByPhone.get(row.customerPhone) ?? null,
          now,
        ).botPaused,
      }))
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
  }

  /** Historial completo de un teléfono en el restaurante, en orden cronológico */
  async getConversation(restaurantId: string, customerPhone: string) {
    this.assertPhone(customerPhone);
    return this.prisma.chatHistory.findMany({
      where: { restaurantId, customerPhone },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, message: true, createdAt: true },
    });
  }

  /** Canal de envío: Meta si el local tiene credenciales; si no, su sesión de WhatsApp Web (Baileys) */
  private async resolveChannel(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, whatsappPhoneId: true, whatsappToken: true },
    });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');
    const viaMeta = Boolean(restaurant.whatsappPhoneId && restaurant.whatsappToken);
    return {
      channel: viaMeta ? ('META' as const) : ('BAILEYS' as const),
      phoneId: viaMeta ? restaurant.whatsappPhoneId! : restaurant.id,
      token: viaMeta ? restaurant.whatsappToken! : '',
    };
  }

  /** Estado de la conversación para la cabecera del chat: bot activo/pausado y canal */
  async getStatus(restaurantId: string, customerPhone: string): Promise<ConversationStatus> {
    this.assertPhone(customerPhone);
    const [{ channel }, handover, lastCustomer] = await Promise.all([
      this.resolveChannel(restaurantId),
      getHandoverState(this.prisma, restaurantId, customerPhone),
      this.prisma.chatHistory.findFirst({
        where: { restaurantId, customerPhone, role: CHAT_ROLE_USER },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    const lastCustomerMessageAt = lastCustomer?.createdAt ?? null;
    return {
      ...handover,
      channel,
      lastCustomerMessageAt,
      outsideMetaWindow:
        channel === 'META' &&
        (!lastCustomerMessageAt || Date.now() - lastCustomerMessageAt.getTime() > META_SERVICE_WINDOW_MS),
    };
  }

  /** Pausa o reanuda el bot en esta conversación (marcador en el historial) */
  async setBotPaused(restaurantId: string, customerPhone: string, botPaused: boolean): Promise<ConversationStatus> {
    this.assertPhone(customerPhone);
    const current = await getHandoverState(this.prisma, restaurantId, customerPhone);
    if (current.botPaused !== botPaused) {
      await this.prisma.chatHistory.create({
        data: {
          restaurantId,
          customerPhone,
          role: CHAT_ROLE_SYSTEM,
          message: botPaused ? BOT_PAUSED_MARKER : BOT_RESUMED_MARKER,
        },
      });
    }
    return this.getStatus(restaurantId, customerPhone);
  }

  /**
   * Mensaje manual del equipo al cliente. Pausa el bot (si estaba activo) para que la IA no
   * interrumpa al humano; el mensaje solo se registra si WhatsApp lo aceptó.
   */
  async sendManualMessage(restaurantId: string, customerPhone: string, text: string) {
    this.assertPhone(customerPhone);
    const message = text.trim();
    if (!message) throw new BadRequestException('Escribe un mensaje');

    const { channel, phoneId, token } = await this.resolveChannel(restaurantId);
    let result: any;
    try {
      result = await this.whatsapp.sendTextMessage(phoneId, token, customerPhone, message, channel === 'BAILEYS');
    } catch (error: any) {
      result = { error: { message: error?.message } };
    }
    // Meta devuelve { error } (ej. fuera de la ventana de 24 h); Baileys, null o { success: false }
    if (!result || result.error || result.success === false) {
      const detail = result?.error?.message || result?.error || '';
      this.logger.warn(`Envío manual a ${customerPhone} rechazado (${channel}): ${JSON.stringify(detail)}`);
      throw new BadGatewayException(
        channel === 'META'
          ? 'WhatsApp no entregó el mensaje. Si el cliente no escribe hace más de 24 h, Meta solo permite plantillas aprobadas.'
          : 'WhatsApp no entregó el mensaje. Verifica que la sesión de WhatsApp Web del local esté conectada.',
      );
    }

    // Marcador antes del mensaje: en el historial se lee "bot pausado" y luego la respuesta humana
    const handover = await getHandoverState(this.prisma, restaurantId, customerPhone);
    if (!handover.botPaused) {
      await this.prisma.chatHistory.create({
        data: { restaurantId, customerPhone, role: CHAT_ROLE_SYSTEM, message: BOT_PAUSED_MARKER },
      });
    }
    const saved = await this.prisma.chatHistory.create({
      data: { restaurantId, customerPhone, role: CHAT_ROLE_AGENT, message },
      select: { id: true, role: true, message: true, createdAt: true },
    });
    return { message: saved, status: await this.getStatus(restaurantId, customerPhone) };
  }
}
