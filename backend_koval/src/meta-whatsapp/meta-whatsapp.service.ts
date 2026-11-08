import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { syncWhatsAppBotNumber } from '../restaurants/whatsapp-bot-number';
import { AiService, type OrderIntent } from '../ai/ai.service';
import { isLidContact } from '../orders/phone';
import { OrdersGateway } from '../orders/orders.gateway';
import { OrderStatus } from '@prisma/client';
import { MetaWebhookPayloadDto } from './dto/webhook-payload.dto';
import { internalApiHeaders } from '../config/secrets';
import { buildClosedMessage, isRestaurantClosed } from '../restaurants/business-hours';
import {
  CHAT_ROLE_AGENT,
  CHAT_ROLE_MODEL,
  CHAT_ROLE_SYSTEM,
  CHAT_ROLE_USER,
  RESET_CONTEXT_MARKER,
} from '../chats/chat-history';
import { BOT_PAUSED_MARKER, getHandoverState } from '../chats/handover';
import { ChatQueue } from './chat-queue';
import {
  BAILEYS_MEDIA_PREFIX,
  MENU_PDF_MEDIA,
  chatMediaMime,
  chatMediaPath,
  describeChatMedia,
  readChatMedia,
  storeChatMedia,
  type ChatMediaKind,
  type StoredChatMedia,
} from '../chats/chat-media';
import { dailyNumberOf, formatDailyNumber } from '../orders/daily-number';
import {
  ADD_ON_STATUSES,
  ADD_ON_WINDOW_MS,
  buildAddOnConfirmationMessage,
  buildAddOnRegisteredMessage,
  buildConfirmationMessage,
  buildOrderStatusMessage,
  type OrderLine,
  buildPaymentInstructions,
  buildOrderLines,
  buildOrderNotes,
  buildRegisteredMessage,
  hasRequiredData,
  needsPaymentMethod,
  orderTotal,
  toPrismaOrderType,
  toOrderPaymentMethod,
  withPaymentMethodQuestion,
} from './order-flow';

/**
 * Endpoint de envío de la sesión Baileys de un restaurante (multi-tenant).
 * WHATSAPP_SERVICE_URL apunta a ".../send"; la sesión se elige por restaurantId.
 */
function baileysSendUrl(restaurantId: string): string {
  const base = (process.env.WHATSAPP_SERVICE_URL || 'http://whatsapp_baileys:5000/send').replace(/\/send\/?$/, '');
  return `${base}/sessions/${encodeURIComponent(restaurantId)}/send`;
}

/** Texto de un mensaje entrante sin transcribir audio (texto, captions o botones) */
function extractPlainText(msg: any): string {
  return (
    msg?.text?.body ||
    msg?.image?.caption ||
    msg?.video?.caption ||
    msg?.document?.caption ||
    msg?.interactive?.button_reply?.title ||
    msg?.interactive?.list_reply?.title ||
    msg?.button?.text ||
    ''
  ).trim();
}

/** Ventana para evitar pedidos duplicados si el cliente confirma dos veces */
const DUPLICATE_ORDER_WINDOW_MS = 10 * 60 * 1000;

/** Una imagen o PDF llegada hasta 12 h después de un pedido sin pagar se toma como su comprobante */
const PAYMENT_PROOF_WINDOW_MS = 12 * 60 * 60 * 1000;

/** Tipos de mensaje de WhatsApp que traen archivo (Meta Cloud API y el puente de Baileys) */
const MEDIA_MESSAGE_TYPES = ['image', 'document', 'audio', 'video', 'sticker'] as const;


/** Adjunto de un mensaje entrante: guardado (o no soportado) y, si se descargó, su contenido */
interface IncomingMedia {
  kind: ChatMediaKind | 'unsupported';
  stored: StoredChatMedia | null;
  buffer: Buffer | null;
}

type ChatEntry = {
  role: string;
  message: string;
  mediaType?: string | null;
  mediaUrl?: string | null;
  mediaName?: string | null;
  mediaMime?: string | null;
};

/** Campos de adjunto de ChatHistory para un archivo guardado */
const mediaFields = (stored: StoredChatMedia | null | undefined) =>
  stored ? { mediaType: stored.kind, mediaUrl: stored.file, mediaName: stored.name, mediaMime: stored.mime } : {};

export const PAYMENT_PROOF_ACK = (dailyNumber: number) =>
  `🧾 ¡Recibimos tu comprobante del pedido ${formatDailyNumber(dailyNumber)}! Ya lo estamos validando 🙌`;
export const IMAGE_RECEIVED_REPLY =
  '📷 ¡Recibimos tu archivo! Si es el comprobante de pago, envíalo después de confirmar tu pedido. ¿En qué más te ayudamos?';

/** Si la IA falla del todo: el cliente recibe respuesta y el contexto sigue en el historial */
export const AI_FALLBACK_REPLY =
  'Disculpa, tuve un inconveniente procesando tu mensaje. ¿Me lo repites, por favor? Sigo con tu pedido donde íbamos.';

/** Reclamo: se pausa el bot y se avisa que lo atiende una persona */
export const COMPLAINT_HANDOVER_REPLY =
  'Lamento mucho lo que pasó con tu pedido. Ya le pasé tu caso al equipo del local y una persona te escribe por aquí en breve para solucionarlo.';
/** Pedidos de las últimas horas a los que responde "¿cómo va mi pedido?" */
const ORDER_STATUS_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export interface BotpressConverseResponse {
  responses: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
}

@Injectable()
export class MetaWhatsAppService {
  private readonly logger = new Logger(MetaWhatsAppService.name);
  private readonly botpressUrl = process.env.BOTPRESS_URL || 'http://localhost:3000';
  private readonly chatQueue = new ChatQueue();

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly ordersGateway: OrdersGateway,
  ) { }

  /**
   * Auditoría del Inbox: guarda en orden los mensajes de un intercambio que no pasó por la IA.
   * Nunca lanza: un fallo al registrar no debe afectar a la respuesta ya enviada.
   */
  private async recordChat(restaurantId: string, customerPhone: string, entries: ChatEntry[]): Promise<void> {
    try {
      // Inserciones secuenciales: createdAt creciente preserva el orden en el Inbox
      for (const entry of entries) {
        await this.prisma.chatHistory.create({ data: { restaurantId, customerPhone, ...entry } });
      }
    } catch (error: any) {
      this.logger.error(`❌ No se pudo registrar el chat de ${customerPhone} en ChatHistory: ${error?.message || error}`);
    }
  }

  /**
   * Envía un mensaje de texto oficial a WhatsApp utilizando Meta Graph API v22.0
   * @param phoneNumberId ID del número de teléfono del restaurante en Meta Cloud API
   *        (con Baileys: el restaurantId, que identifica su sesión de WhatsApp Web)
   * @param token Token de acceso permanente del restaurante
   * @param to Número de WhatsApp del destinatario (formato internacional)
   * @param body Texto del mensaje a enviar
   */
  async sendTextMessage(
    phoneNumberId: string,
    token: string,
    to: string,
    body: string,
    isBaileys: boolean = false,
  ): Promise<any> {
    if (!phoneNumberId || (!token && !isBaileys)) {
      this.logger.warn('⚠️ No se puede enviar mensaje: phoneNumberId o token no proporcionados.');
      return;
    }

    // Un contacto con LID va tal cual a Baileys, que lo responde en su chat @lid
    const cleanTo = isLidContact(to) ? to : to.replace(/\D/g, '');

    // --- Baileys: se envía el PDF en Base64 ---
    if (isBaileys) {
      const whatsappServiceUrl = baileysSendUrl(phoneNumberId);
      this.logger.log(`📤 [Baileys] Enviando texto a [${cleanTo}]...`);
      try {
        const response = await fetch(whatsappServiceUrl, {
          method: 'POST',
          headers: internalApiHeaders(),
          body: JSON.stringify({
            to: cleanTo,
            text: body,
          }),
        });
        const result = await response.json();
        this.logger.log(`✅ [Baileys] Respuesta del envío de texto: ${JSON.stringify(result)}`);
        return result;
      } catch (e: any) {
        this.logger.error(`❌ [Baileys] Fallo envio de texto: ${e.message}`);
        return null;
      }
    }

    const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;
    this.logger.log(`📤 [Meta v22.0] Enviando mensaje a [${cleanTo}]: "${body.replace(/\n/g, ' ')}"`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: cleanTo,
          type: 'text',
          text: { body },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        this.logger.error(
          `❌ [Meta v22.0] Error de entrega (${response.status}): ${JSON.stringify(data)}`,
        );
        return data;
      }

      this.logger.log(`✅ [Meta v22.0] Mensaje entregado exitosamente a Meta: ${JSON.stringify(data)}`);
      return data;
    } catch (error: any) {
      this.logger.error(`❌ [Meta v22.0] Excepción al conectar con Graph API: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Envía un documento (PDF, etc.) a WhatsApp utilizando Meta Graph API v22.0
   * @param phoneId ID del número de teléfono en Meta Cloud API (con Baileys: el restaurantId)
   * @param token Token de acceso permanente
   * @param to Número de WhatsApp del destinatario
   * @param documentUrl URL pública del documento
   * @param caption Texto opcional que acompaña al documento
   * @param filename Nombre con el que se mostrará el archivo
   */
  async sendDocumentMessage(
    phoneId: string,
    token: string,
    to: string,
    filePathOrUrl: string,
    filename: string = 'Menu_Restaurante.pdf',
    caption: string = '',
    isBaileys: boolean = false,
  ): Promise<any> {
    if (!phoneId || (!token && !isBaileys)) {
      this.logger.warn('⚠️ No se puede enviar documento: phoneId o token no proporcionados.');
      return;
    }

    const fsLib = require('fs');
    const isLocalFile = !/^https?:\/\//i.test(filePathOrUrl);
    // Un contacto con LID va tal cual a Baileys, que lo responde en su chat @lid
    const cleanTo = isLidContact(to) ? to : to.replace(/\D/g, '');

    try {
      // --- Baileys: se envía el PDF en Base64 ---
      if (isBaileys) {
        const fs = require('fs');
        if (fs.existsSync(filePathOrUrl)) {
          const documentBase64 = fs.readFileSync(filePathOrUrl).toString('base64');
          const whatsappServiceUrl = baileysSendUrl(phoneId);
          this.logger.log(`📤 [Baileys] Enviando PDF a [${cleanTo}]...`);
          try {
              const response = await fetch(whatsappServiceUrl, {
                method: 'POST',
                headers: internalApiHeaders(),
                body: JSON.stringify({
                  to: cleanTo,
                  document: documentBase64,
                  filename: filename,
                  mimetype: 'application/pdf',
                  caption: caption
                }),
              });
              const result = await response.json();
              this.logger.log(`✅ [Baileys] Respuesta del envío de PDF: ${JSON.stringify(result)}`);
              return result;
          } catch(e: any) {
              this.logger.error(`❌ [Baileys] Fallo envio de PDF: ${e.message}`);
              return null;
          }
        } else {
          this.logger.error(`❌ EL ARCHIVO NO EXISTE EN EL CONTENEDOR: ${filePathOrUrl}`);
          return null;
        }
      }

      // --- Meta: si es archivo local, se sube primero a Media API ---
      const documentPayload: any = { caption, filename };
      if (isLocalFile) {
        const fileBuffer = fsLib.readFileSync(filePathOrUrl);
        const form = new FormData();
        form.append('messaging_product', 'whatsapp');
        form.append('type', 'application/pdf');
        form.append('file', new Blob([fileBuffer], { type: 'application/pdf' }), filename);
        const uploadRes = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/media`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        const uploadData: any = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.id) {
          this.logger.error(`❌ Error subiendo PDF a Meta: ${JSON.stringify(uploadData)}`);
          return uploadData;
        }
        documentPayload.id = uploadData.id;
      } else {
        documentPayload.link = filePathOrUrl;
      }

      const response = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanTo,
          type: 'document',
          document: documentPayload,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        this.logger.error(`❌ Error enviando documento a ${cleanTo}: ${JSON.stringify(data)}`);
      } else {
        this.logger.log(`✅ Documento PDF enviado exitosamente a ${cleanTo}`);
      }
      return data;
    } catch (error: any) {
      this.logger.error(`❌ Excepción enviando documento a ${cleanTo}: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Reenvía un mensaje de texto a Botpress v12 para obtener la respuesta conversacional
   * @param botId Identificador del bot en Botpress asignado al restaurante
   * @param waId Identificador del usuario (número de WhatsApp)
   * @param text Mensaje de texto recibido
   * @returns Lista de respuestas generadas por Botpress
   */
  async forwardToBotpress(botId: string, waId: string, text: string): Promise<string[]> {
    const activeBotId = botId || 'koval-pizzeria-bot';
    const cleanSender = waId.replace(/\D/g, '') || 'whatsapp_user';
    const endpoint = `${this.botpressUrl}/api/v1/bots/${activeBotId}/converse/${cleanSender}`;

    this.logger.log(`🤖 Reenviando a Botpress [bot: ${activeBotId}, user: ${cleanSender}]: "${text}"`);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'text',
          text,
        }),
        signal: AbortSignal.timeout(6000), // Timeout de 6 segundos
      });

      if (!response.ok) {
        throw new Error(`Botpress HTTP Error ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as BotpressConverseResponse;
      const botResponses = data?.responses || [];
      const replyTexts: string[] = [];

      for (const res of botResponses) {
        if (res.text && typeof res.text === 'string' && res.text.trim()) {
          replyTexts.push(res.text.trim());
        }
      }

      return replyTexts;
    } catch (error: any) {
      this.logger.warn(`⚠️ Error comunicando con Botpress [${activeBotId}]: ${error?.message || error}`);
      return [
        '⚠️ Hola, estamos experimentando una breve interrupción en nuestro asistente virtual. Por favor intenta nuevamente en unos minutos.',
      ];
    }
  }

  /**
   * Adjunto de un mensaje entrante: con Meta se descarga por su id; Baileys ya lo subió y manda la
   * referencia. Se guarda en uploads/chat/<restaurantId>/ para el Inbox. Nunca lanza.
   */
  private async captureIncomingMedia(
    restaurantId: string,
    msg: any,
    token: string,
    isBaileys: boolean,
  ): Promise<IncomingMedia | null> {
    const type = MEDIA_MESSAGE_TYPES.find((t) => msg?.[t]);
    if (!type) return null;
    const media = msg[type];
    const name: string | null = media?.filename ?? null;
    if (type === 'video' || type === 'sticker') return { kind: 'unsupported', stored: null, buffer: null };

    try {
      if (isBaileys) {
        const ref = typeof media?.id === 'string' && media.id.startsWith(BAILEYS_MEDIA_PREFIX) ? media.id.slice(BAILEYS_MEDIA_PREFIX.length) : null;
        const filePath = ref ? chatMediaPath(restaurantId, ref) : null;
        const exists = filePath ? await fs.promises.stat(filePath).then((s) => s.isFile()).catch(() => false) : false;
        if (!ref || !exists || ref === MENU_PDF_MEDIA) {
          return { kind: 'unsupported', stored: null, buffer: null };
        }
        const mime = chatMediaMime(ref);
        const kind: ChatMediaKind = mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : 'document';
        return { kind, stored: { kind, file: ref, mime, name }, buffer: null };
      }

      if (!media?.id || !token) return { kind: 'unsupported', stored: null, buffer: null };
      const buffer = await this.downloadMedia(media.id, token);
      const stored = await storeChatMedia(restaurantId, buffer, media.mime_type, name);
      return stored ? { kind: stored.kind, stored, buffer } : { kind: 'unsupported', stored: null, buffer };
    } catch (error: any) {
      this.logger.error(`❌ No se pudo guardar el adjunto (${type}) de un mensaje entrante: ${error?.message || error}`);
      return { kind: 'unsupported', stored: null, buffer: null };
    }
  }

  /** "¿Cómo va mi pedido?": último pedido del cliente (24 h) con su estado real */
  private async buildOrderStatusReply(restaurantId: string, customerPhone: string): Promise<string> {
    const order = await this.prisma.order.findFirst({
      where: { restaurantId, customerPhone, createdAt: { gte: new Date(Date.now() - ORDER_STATUS_LOOKBACK_MS) } },
      orderBy: { createdAt: 'desc' },
    });
    if (!order) return buildOrderStatusMessage(null, null);
    return buildOrderStatusMessage(order, await dailyNumberOf(this.prisma, order));
  }

  /** Pedido recién registrado del cliente al que todavía se le pueden sumar productos */
  private async findOpenOrderForAddOn(restaurantId: string, customerPhone: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        restaurantId,
        customerPhone,
        status: { in: [...ADD_ON_STATUSES] as OrderStatus[] },
        archivedAt: null,
        createdAt: { gte: new Date(Date.now() - ADD_ON_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    return order ? { order, dailyNumber: await dailyNumberOf(this.prisma, order) } : null;
  }

  /** Suma productos (precios de la BD) a un pedido existente y avisa al Kanban/KDS; devuelve el nuevo total */
  private async appendItemsToOrder(
    order: { id: string; restaurantId: string; total: number; notes: string | null },
    lines: OrderLine[],
    dailyNumber: number,
  ): Promise<number> {
    const extraNotes = lines.filter((l) => l.notes).map((l) => `${l.name}: ${l.notes}`);
    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        total: { increment: orderTotal(lines) },
        notes: [order.notes, `➕ Adición: ${lines.map((l) => `${l.quantity}x ${l.name}`).join(', ')}`, ...extraNotes]
          .filter(Boolean)
          .join('\n'),
        items: {
          create: lines.map(({ menuItemId, quantity, unitPrice, subtotal }) => ({ menuItemId, quantity, unitPrice, subtotal })),
        },
      },
      include: { items: { include: { menuItem: true } } },
    });
    this.ordersGateway.emitOrderUpdated(order.restaurantId, { ...updated, dailyNumber });
    this.logger.log(`➕ Adición al pedido ${order.id} (turno ${formatDailyNumber(dailyNumber)}): nuevo total $${updated.total}`);
    return updated.total;
  }

  /**
   * Comprobante de pago: una imagen o PDF que llega poco después de un pedido sin pagar del mismo
   * cliente queda adjunta al pedido; el Kanban la muestra para que el local valide y marque el pago.
   */
  private async attachPaymentProof(restaurantId: string, customerPhone: string, stored: StoredChatMedia) {
    if (stored.kind === 'audio') return null;
    const order = await this.prisma.order.findFirst({
      where: {
        restaurantId,
        customerPhone,
        status: { not: OrderStatus.CANCELLED },
        paymentStatus: { not: 'PAID' },
        createdAt: { gte: new Date(Date.now() - PAYMENT_PROOF_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!order) return null;

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { paymentProofUrl: stored.file, paymentProofAt: new Date() },
      include: { items: { include: { menuItem: true } } },
    });
    const dailyNumber = await dailyNumberOf(this.prisma, updated);
    this.ordersGateway.emitOrderUpdated(restaurantId, { ...updated, dailyNumber });
    this.logger.log(`🧾 Comprobante adjuntado al pedido ${updated.id} (turno ${formatDailyNumber(dailyNumber)})`);
    return { ...updated, dailyNumber };
  }

  async downloadMedia(mediaId: string, token: string): Promise<Buffer> {
    // 1. Obtener URL de descarga del nodo de media
    const res = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.url) throw new Error('No se pudo obtener la URL del media HTTP ' + res.status);

    // 2. Descargar el binario
    const mediaRes = await fetch(data.url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const arrayBuffer = await mediaRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Procesa el payload del webhook de Meta en segundo plano (asíncrono no bloqueante)
   * Resuelve dinámicamente el restaurante en PostgreSQL según el verifyToken o phoneNumberId
   * @param payload Objeto webhook entrante de Meta
   * @param verifyToken Token de verificación recibido en la URL
   */
  /**
   * BYOA: identifica a qué restaurantes se refiere un webhook de Meta a partir de su payload
   * (phone_number_id de cada cambio y WABA id de cada entrada) y devuelve su App Secret.
   * El payload aún NO es de confianza: solo se usa para saber con qué secreto verificar la firma.
   */
  async findWebhookRestaurants(
    payload: any,
  ): Promise<Array<{ id: string; name: string; metaAppSecret: string | null }>> {
    const entries: any[] = Array.isArray(payload?.entry) ? payload.entry : [];
    const phoneIds = new Set<string>();
    const wabaIds = new Set<string>();

    for (const entry of entries) {
      if (typeof entry?.id === 'string' && entry.id) wabaIds.add(entry.id);
      const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const phoneId = change?.value?.metadata?.phone_number_id;
        if (typeof phoneId === 'string' && phoneId) phoneIds.add(phoneId);
      }
    }

    if (phoneIds.size === 0 && wabaIds.size === 0) return [];

    return this.prisma.restaurant.findMany({
      where: {
        OR: [
          ...(phoneIds.size ? [{ whatsappPhoneId: { in: [...phoneIds] } }] : []),
          ...(wabaIds.size ? [{ whatsappWabaId: { in: [...wabaIds] } }] : []),
        ],
      },
      select: { id: true, name: true, metaAppSecret: true },
    });
  }

  /**
   * @param trustedRestaurantIds Webhooks de Meta: restaurantes cuya firma ya se verificó.
   *        El mensaje SOLO puede procesarse para uno de ellos (evita que un tenant con su
   *        propio App Secret inyecte mensajes en otro restaurante vía el verifyToken de la URL).
   */
  async processIncomingWebhook(
    payload: MetaWebhookPayloadDto | any,
    verifyToken: string,
    isBaileys: boolean = false,
    trustedRestaurantIds?: string[],
  ): Promise<void> {
    // Mensajes en ráfaga del mismo chat: de a uno y en orden (ver ChatQueue)
    const value = payload?.entry?.[0]?.changes?.[0]?.value;
    const from = value?.messages?.[0]?.from;
    const run = () => this.handleIncomingWebhook(payload, verifyToken, isBaileys, trustedRestaurantIds);
    if (!from) return run();
    const line = value?.metadata?.phone_number_id || payload?.entry?.[0]?.id || verifyToken;
    return this.chatQueue.run(`${line}|${from}`, run);
  }

  private async handleIncomingWebhook(
    payload: MetaWebhookPayloadDto | any,
    verifyToken: string,
    isBaileys: boolean,
    trustedRestaurantIds?: string[],
  ): Promise<void> {
    try {
      const entry = payload?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;

      if (!value) {
        this.logger.debug('Webhook recibido sin estructura válida value/changes');
        return;
      }

      // Si es una notificación de estado (entregado, leído, etc.), no procesar como mensaje
      if (value.statuses && !value.messages) {
        this.logger.debug(`Notificación de estado Meta recibida: ${value.statuses[0]?.status}`);
        return;
      }

      const messages = value.messages;
      if (!messages || messages.length === 0) {
        return;
      }

      const incomingMsg = messages[0];
      const senderNumber = incomingMsg.from;
      const phoneNumberId = value.metadata?.phone_number_id;
      const displayPhoneNumber = value.metadata?.display_phone_number;

      // 1. Búsqueda Multi-Tenant del restaurante en PostgreSQL
      const searchConditions: any[] = [];
      if (verifyToken) {
        searchConditions.push({ whatsappVerifyToken: verifyToken });
        searchConditions.push({ slug: verifyToken });
      }
      if (phoneNumberId) {
        searchConditions.push({ whatsappPhoneId: phoneNumberId });
      }

      if (searchConditions.length === 0) {
        this.logger.warn('⚠️ Webhook recibido sin verifyToken ni phoneNumberId identificable.');
        return;
      }

      const restaurant = await this.prisma.restaurant.findFirst({
        where: trustedRestaurantIds
          ? {
              // Meta: solo restaurantes con firma verificada, identificados por el payload firmado.
              // Baileys: el restaurante dueño de la sesión (x-restaurant-id con clave interna).
              id: { in: trustedRestaurantIds },
              ...(phoneNumberId && !isBaileys ? { whatsappPhoneId: phoneNumberId } : {}),
            }
          : { OR: searchConditions },
      });

      if (!restaurant) {
        this.logger.warn(
          `⚠️ [Multi-Tenant] No se encontró ningún restaurante registrado en BD para verifyToken="${verifyToken}" / phoneNumberId="${phoneNumberId}"`,
        );
        return;
      }

      // Línea de Meta verificada (webhook firmado): su número pasa a ser el de la carta pública
      if (!isBaileys && displayPhoneNumber) {
        void syncWhatsAppBotNumber(this.prisma, restaurant.id, displayPhoneNumber, restaurant.whatsappBotNumber);
      }

      // 2. Validar que el restaurante tenga configuradas sus credenciales oficiales de Meta.
      //    Baileys no las necesita: responde por la sesión del restaurante, cuya llave
      //    (restaurantId) viaja en targetPhoneId.
      const targetToken = isBaileys ? '' : restaurant.whatsappToken || '';
      const targetPhoneId = isBaileys ? restaurant.id : restaurant.whatsappPhoneId || phoneNumberId;

      if (!isBaileys && (!targetToken || !targetPhoneId)) {
        this.logger.warn(
          `⚠️ [Multi-Tenant] El restaurante "${restaurant.name}" (${restaurant.slug}) no tiene configurado whatsappToken o whatsappPhoneId en el Dashboard. Abortando despacho.`,
        );
        return;
      }

      // 2.3. Adjuntos (fotos, comprobantes, PDFs, notas de voz): se guardan para verlos en el Inbox
      const media = await this.captureIncomingMedia(restaurant.id, incomingMsg, targetToken, isBaileys);
      const caption = extractPlainText(incomingMsg);
      const incomingLabel = media ? describeChatMedia(media.kind, caption, media.stored?.name) : caption;
      const userEntry = (message: string): ChatEntry => ({ role: CHAT_ROLE_USER, message, ...mediaFields(media?.stored) });
      // Imagen o PDF tras un pedido sin pagar: es su comprobante (queda adjunto al pedido en el Kanban)
      const proofOrder = media?.stored ? await this.attachPaymentProof(restaurant.id, senderNumber, media.stored) : null;

      // 2.4. Handover humano: el equipo atiende esta conversación desde el Inbox. Se registra el
      //      mensaje del cliente (sin transcribir audio ni llamar a la IA) y no se responde nada.
      if ((await getHandoverState(this.prisma, restaurant.id, senderNumber)).botPaused) {
        this.logger.log(`👤 [${restaurant.name}] Bot pausado para [${senderNumber}]: lo atiende un humano`);
        if (incomingLabel) await this.recordChat(restaurant.id, senderNumber, [userEntry(incomingLabel)]);
        return;
      }

      // 2.45. Comprobante recibido: acuse inmediato, sin IA (también con el local ya cerrado)
      if (proofOrder) {
        const ack = PAYMENT_PROOF_ACK(proofOrder.dailyNumber);
        await this.sendTextMessage(targetPhoneId, targetToken, senderNumber, ack, isBaileys);
        await this.recordChat(restaurant.id, senderNumber, [userEntry(incomingLabel), { role: CHAT_ROLE_MODEL, message: ack }]);
        return;
      }

      // 2.5. Escudo de horario: con el local cerrado (botón de emergencia o fuera de horario)
      //      no se transcribe audio ni se llama a la IA; se responde con el mensaje de cierre.
      if (isRestaurantClosed(restaurant)) {
        this.logger.log(`🌙 [${restaurant.name}] Local cerrado: respuesta estática a [${senderNumber}] sin IA`);
        const closedMessage = buildClosedMessage(restaurant);
        await this.sendTextMessage(targetPhoneId, targetToken, senderNumber, closedMessage, isBaileys);
        // Auditoría del Inbox: el audio no se transcribe con el local cerrado
        await this.recordChat(restaurant.id, senderNumber, [
          ...(incomingLabel ? [userEntry(incomingLabel)] : []),
          { role: CHAT_ROLE_MODEL, message: closedMessage },
        ]);
        return;
      }

      // 3. Extraer el texto del mensaje según su tipo
      let messageText = caption;
      if (!messageText && media?.kind === 'audio' && media.stored) {
        this.logger.log(`🎙️ Nota de voz recibida (${media.stored.file}). Transcribiendo...`);
        try {
          const audioBuffer = media.buffer ?? (await readChatMedia(restaurant.id, media.stored.file));
          if (audioBuffer) {
            messageText = await this.aiService.transcribeAudio(audioBuffer, media.stored.mime);
            this.logger.log(`🎙️ Audio transcrito con éxito: "${messageText}"`);
          }
        } catch (audioErr: any) {
          this.logger.error(`❌ Error al procesar audio: ${audioErr?.message || audioErr}`);
        }
      }

      // Foto o documento sin texto (y que no es comprobante): la IA no ve imágenes; se acusa recibo
      if (!messageText?.trim() && media && media.kind !== 'audio') {
        await this.sendTextMessage(targetPhoneId, targetToken, senderNumber, IMAGE_RECEIVED_REPLY, isBaileys);
        await this.recordChat(restaurant.id, senderNumber, [userEntry(incomingLabel), { role: CHAT_ROLE_MODEL, message: IMAGE_RECEIVED_REPLY }]);
        return;
      }

      if (!messageText || !messageText.trim()) {
        // Nota de voz que no se pudo transcribir: al menos queda en el Inbox
        if (media) await this.recordChat(restaurant.id, senderNumber, [userEntry(incomingLabel)]);
        this.logger.debug(`Mensaje recibido de ${senderNumber} sin contenido de texto o caption soportado`);
        return;
      }

      this.logger.log(
        `📩 [${restaurant.name}] Mensaje entrante de [${senderNumber}] (PhoneID: ${targetPhoneId}): "${messageText}"`,
      );

      // 4. Obtener el menú disponible del restaurante desde Prisma
      const menuItems = await this.prisma.menuItem.findMany({
        where: { isAvailable: true, deletedAt: null, restaurantId: restaurant.id },
        include: { category: { select: { name: true } } },
      });

      const lowerMsg = messageText.toLowerCase().trim();

      // --- 3.5 COMANDO DE SISTEMA: RESET ---
      if (lowerMsg === 'reset') {
        this.logger.log(`🧹 Ejecutando comando de reset para ${senderNumber}`);
        const resetReply = '🧠 Memoria borrada. Contexto limpio. ¿En qué puedo ayudarte de nuevo?';
        await this.sendTextMessage(targetPhoneId, targetToken, senderNumber, resetReply, isBaileys);
        // Sin borrado físico: el marcador va al final para que la IA arranque limpia tras él
        await this.recordChat(restaurant.id, senderNumber, [
          userEntry(messageText.trim()),
          { role: CHAT_ROLE_MODEL, message: resetReply },
          { role: CHAT_ROLE_SYSTEM, message: RESET_CONTEXT_MARKER },
        ]);
        return; // Detener flujo
      }

      // --- 4. INTERCEPTOR DE RESPUESTAS RÁPIDAS (Bypass de IA) ---
      // Limpiamos la puntuación del mensaje para comparar palabras exactas (ej. "Hola!" -> "hola")
      const normalizedMsg = lowerMsg.replace(/[.,!?¡¿]/g, '').trim();

      const autoReplies = await this.prisma.autoReply.findMany({
        where: { restaurantId: restaurant.id, isActive: true },
      });

      const matchedReply = autoReplies.find((reply) =>
        reply.responseType !== 'DYNAMIC_MENU' &&
        reply.triggerWords.some((word) => normalizedMsg === word.toLowerCase()),
      );

      if (matchedReply) {
        this.logger.log(`⚡ Interceptor activado para restaurante ${restaurant.id}. Bypass de IA.`);
        let finalResponse = '';

        if (matchedReply.responseType === 'TEXT') {
          finalResponse = matchedReply.responseBody || 'Hola, ¿en qué podemos ayudarte?';
        } else if (matchedReply.responseType === 'WEB_LINK') {
          finalResponse =
            matchedReply.responseBody ||
            `¡Hola! Conoce nuestro menú interactivo aquí: ${process.env.FRONTEND_URL || 'https://kovalcloud.com'}/menu/${restaurant.id}`;
        } else if (matchedReply.responseType === 'PDF_DOCUMENT') {
          const pdfUrl =
            matchedReply.responseBody ||
            'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
          const pdfCaption = '📄 Aquí tienes nuestro menú. ¡Dime qué te gustaría ordenar!';
          await this.sendDocumentMessage(targetPhoneId, targetToken, senderNumber, pdfUrl, "Menu.pdf", pdfCaption, isBaileys);
          await this.recordChat(restaurant.id, senderNumber, [
            userEntry(messageText.trim()),
            {
              role: CHAT_ROLE_MODEL,
              message: pdfCaption,
              mediaType: 'document',
              mediaUrl: /^https?:\/\//i.test(pdfUrl) ? pdfUrl : null,
              mediaName: 'Menu.pdf',
              mediaMime: 'application/pdf',
            },
          ]);
          return; // Detiene la ejecución de IA
        }

        await this.sendTextMessage(targetPhoneId, targetToken, senderNumber, finalResponse, isBaileys);
        await this.recordChat(restaurant.id, senderNumber, [
          userEntry(messageText.trim()),
          { role: CHAT_ROLE_MODEL, message: finalResponse },
        ]);
        return; // Detiene la ejecución aquí (Costo IA: $0)
      }
      // --- FIN INTERCEPTOR ---

      const menuString = menuItems
        // La categoría permite a la IA distinguir platos principales de bebidas/acompañamientos (upselling)
        .map((i) => `ID: ${i.id} | Categoría: ${i.category?.name ?? '-'} | Nombre: ${i.name} | Precio: ${i.price}`)
        .join('\n');

      // 4.5. Obtener historial de conversación previo (últimos 20 mensajes desde el último reset)
      const lastReset = await this.prisma.chatHistory.findFirst({
        where: {
          restaurantId: restaurant.id,
          customerPhone: senderNumber,
          role: CHAT_ROLE_SYSTEM,
          message: RESET_CONTEXT_MARKER,
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const rawHistory = await this.prisma.chatHistory.findMany({
        where: {
          restaurantId: restaurant.id,
          customerPhone: senderNumber,
          // Los mensajes del equipo (agent) también dan contexto a la IA al reanudar el bot
          role: { in: [CHAT_ROLE_USER, CHAT_ROLE_MODEL, CHAT_ROLE_AGENT] },
          ...(lastReset ? { createdAt: { gt: lastReset.createdAt } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      const chatHistory = rawHistory.reverse();

      // Guardar el mensaje del usuario en el historial (con su adjunto: foto con texto, nota de voz)
      await this.prisma.chatHistory.create({
        data: {
          restaurantId: restaurant.id,
          customerPhone: senderNumber,
          role: 'user',
          message: messageText.trim(),
          ...mediaFields(media?.stored),
        },
      });

      // 5. Procesar el mensaje con Inteligencia Artificial (Gemini). Si falla (incluso tras el
      //    reintento), se responde igual: el cliente nunca se queda sin respuesta
      let aiResult: OrderIntent;
      try {
        aiResult = await this.aiService.parseOrderIntent(messageText.trim(), menuString, chatHistory, restaurant.name);
      } catch (error: any) {
        this.logger.error(`❌ La IA no pudo procesar el mensaje de ${senderNumber}: ${error?.message || error}`);
        await this.sendTextMessage(targetPhoneId, targetToken, senderNumber, AI_FALLBACK_REPLY, isBaileys);
        await this.recordChat(restaurant.id, senderNumber, [{ role: CHAT_ROLE_MODEL, message: AI_FALLBACK_REPLY }]);
        return;
      }

      // Log de la estructura extraída por IA
      console.log('JSON Extraído por IA:', JSON.stringify(aiResult, null, 2));

      // 5.1. Queja o reclamo ("llegó frío", "falta un producto"): el bot se pausa y lo atiende una
      //      persona desde el Inbox; no se intenta vender ni responder con la IA
      if (aiResult.intent === 'COMPLAINT') {
        this.logger.warn(`🚨 [${restaurant.name}] Reclamo de [${senderNumber}]: bot pausado, pasa a un humano`);
        await this.sendTextMessage(targetPhoneId, targetToken, senderNumber, COMPLAINT_HANDOVER_REPLY, isBaileys);
        await this.recordChat(restaurant.id, senderNumber, [
          { role: CHAT_ROLE_MODEL, message: COMPLAINT_HANDOVER_REPLY },
          { role: CHAT_ROLE_SYSTEM, message: BOT_PAUSED_MARKER },
        ]);
        return;
      }

      // 5.2. "¿Cómo va mi pedido?": estado real de la BD (la IA no lo conoce y tendería a vender)
      if (aiResult.intent === 'ORDER_STATUS') {
        const statusReply = await this.buildOrderStatusReply(restaurant.id, senderNumber);
        await this.sendTextMessage(targetPhoneId, targetToken, senderNumber, statusReply, isBaileys);
        await this.recordChat(restaurant.id, senderNumber, [{ role: CHAT_ROLE_MODEL, message: statusReply }]);
        return;
      }

      // 6. Flujo de pedido / reserva con confirmación estricta.
      //    El backend decide con los datos (no solo con el flag de la IA) y calcula el total con precios de la BD.
      let finalResponse = aiResult.responseToUser;

      // El matching de ítems y el armado del pedido nunca deben dejar al bot callado: si algo falla
      // (dato inesperado de la IA, error de BD), se responde con lo que dijo la IA o un respaldo
      try {
        // 6.A. "Agrégame una bebida" con el pedido ya registrado: se suma a ese pedido (no se crea
        //      otro desde cero ni se vuelven a cobrar los productos anteriores)
        const addOnTarget =
          aiResult.intent === 'ORDER' && aiResult.addToPreviousOrder
            ? await this.findOpenOrderForAddOn(restaurant.id, senderNumber)
            : null;
        const addOnLines = addOnTarget ? buildOrderLines(aiResult.items, menuItems) : [];

        if (addOnTarget && addOnLines.length > 0) {
          if (aiResult.customerConfirmed) {
            const newTotal = await this.appendItemsToOrder(addOnTarget.order, addOnLines, addOnTarget.dailyNumber);
            finalResponse = buildAddOnRegisteredMessage(addOnLines, addOnTarget.dailyNumber, newTotal);
          } else if (aiResult.readyToConfirm) {
            finalResponse = `${aiResult.responseToUser}\n\n${buildAddOnConfirmationMessage(addOnLines, addOnTarget.dailyNumber)}`.trim();
          }
        } else if (aiResult.intent === 'ORDER' || aiResult.intent === 'RESERVATION') {
          const lines = buildOrderLines(aiResult.items, menuItems);
          const complete = hasRequiredData(aiResult, lines);
          // Domicilio/recoger no se confirman sin saber si paga en efectivo o por transferencia
          const missingPaymentMethod = complete && needsPaymentMethod(aiResult) && !aiResult.paymentMethod;

          if (missingPaymentMethod && (aiResult.readyToConfirm || aiResult.customerConfirmed)) {
            // 6.0. La IA dio el pedido por listo sin el método de pago: se pregunta antes del resumen
            finalResponse = withPaymentMethodQuestion(aiResult, aiResult.responseToUser);
          } else if (complete && aiResult.customerConfirmed) {
            // 6.1. El cliente aceptó la confirmación: registrar el pedido
            const total = orderTotal(lines);
            const duplicate = await this.prisma.order.findFirst({
              where: {
                restaurantId: restaurant.id,
                customerPhone: incomingMsg.from,
                total,
                orderType: toPrismaOrderType(aiResult),
                status: { not: OrderStatus.CANCELLED },
                createdAt: { gte: new Date(Date.now() - DUPLICATE_ORDER_WINDOW_MS) },
              },
            });

            if (duplicate) {
              this.logger.warn(`⚠️ Confirmación duplicada de ${incomingMsg.from}: pedido ${duplicate.id} ya existe`);
              const duplicateNumber = await dailyNumberOf(this.prisma, duplicate);
              finalResponse = `✅ Tu pedido ${formatDailyNumber(duplicateNumber)} ya está registrado. ¡No te preocupes, no lo duplicamos!`;
            } else {
              const newOrder = await this.prisma.order.create({
                data: {
                  restaurantId: restaurant.id,
                  customerName: aiResult.customerName?.trim() || 'Cliente WhatsApp',
                  customerPhone: incomingMsg.from,
                  channel: 'WHATSAPP',
                  orderType: toPrismaOrderType(aiResult),
                  deliveryAddress: aiResult.orderType === 'DELIVERY' ? aiResult.deliveryAddress?.trim() : undefined,
                  notes: buildOrderNotes(aiResult, lines),
                  total,
                  paymentMethod: toOrderPaymentMethod(aiResult),
                  status: OrderStatus.PENDING,
                  items: {
                    create: lines.map(({ menuItemId, quantity, unitPrice, subtotal }) => ({
                      menuItemId,
                      quantity,
                      unitPrice,
                      subtotal,
                    })),
                  },
                },
                include: { items: { include: { menuItem: true } } },
              });

              this.logger.log(`✅ Orden confirmada y guardada en BD: ${newOrder.id} (${newOrder.orderType}, $${total})`);

              // Turno del día (#07): la referencia que ven el cliente, el Kanban y el repartidor
              const dailyNumber = await dailyNumberOf(this.prisma, newOrder);

              // Emitir el evento por WebSocket al KDS (Kitchen Display System)
              this.ordersGateway.emitNewOrder(restaurant.id, { ...newOrder, dailyNumber });

              finalResponse = `${aiResult.responseToUser}\n\n${buildRegisteredMessage(aiResult, dailyNumber)}`.trim();

              // Cobro: efectivo sin cuentas; transferencia con los datos de pago del local y el comprobante
              const paymentInstructions = buildPaymentInstructions(aiResult, restaurant.paymentDetails);
              if (paymentInstructions) finalResponse += `\n\n${paymentInstructions}`;
            }
          } else if (complete && aiResult.readyToConfirm) {
            // 6.2. Datos completos: pedir confirmación con el total exacto (aún NO se crea el pedido)
            finalResponse = `${aiResult.responseToUser}\n\n${buildConfirmationMessage(aiResult, lines)}`.trim();
          }
          // 6.3. Si faltan datos, la respuesta de la IA ya está pidiendo lo que falta
        }
      } catch (error: any) {
        this.logger.error(`❌ Error armando el pedido de ${senderNumber}: ${error?.message || error}`, error?.stack);
        finalResponse = aiResult.responseToUser?.trim() || AI_FALLBACK_REPLY;
      }
      if (!finalResponse?.trim()) finalResponse = AI_FALLBACK_REPLY;

      // 7. Enviar la respuesta generada por IA al cliente vía Meta Graph API v22.0
      let pdfSent = false;
      if (aiResult.sendMenuPdf) {
        const menuPdfPath = path.join(process.cwd(), 'uploads', 'menus', `${restaurant.id}.pdf`);
        if (fs.existsSync(menuPdfPath)) {
          try {
            const docRes = await this.sendDocumentMessage(
              targetPhoneId,
              targetToken,
              senderNumber,
              menuPdfPath,
              'Menu.pdf',
              finalResponse.slice(0, 1000),
              isBaileys,
            );
            pdfSent = !!docRes && !docRes.error;
            if (pdfSent) this.logger.log(`📄 Menú PDF enviado a ${senderNumber} (caption = respuesta IA)`);
          } catch (e: any) {
            this.logger.error(`❌ Falló envío del PDF, se enviará solo texto: ${e?.message || e}`);
          }
        } else {
          this.logger.warn(`⚠️ PDF de menú no encontrado en ${menuPdfPath}, se envía el enlace al menú web.`);
          const menuUrl = `${process.env.FRONTEND_URL || 'https://kovalcloud.com'}/menu/${restaurant.slug}`;
          finalResponse += `\n\n📲 Mira nuestro menú aquí: ${menuUrl}`;
        }
      }

      if (!pdfSent) {
        await this.sendTextMessage(targetPhoneId, targetToken, senderNumber, finalResponse, isBaileys);
      }

      // Guardar la respuesta del modelo en el historial de chat (con la carta en PDF si se envió)
      await this.prisma.chatHistory.create({
        data: {
          restaurantId: restaurant.id,
          customerPhone: senderNumber,
          role: 'model',
          message: finalResponse,
          ...(pdfSent
            ? { mediaType: 'document', mediaUrl: MENU_PDF_MEDIA, mediaName: 'Menu.pdf', mediaMime: 'application/pdf' }
            : {}),
        },
      });
    } catch (error: any) {
      this.logger.error(`❌ Error procesando webhook entrante de Meta: ${error?.message || error}`, error?.stack);
    }
  }
}
