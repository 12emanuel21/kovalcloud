import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
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
import { getHandoverState } from '../chats/handover';
import {
  buildConfirmationMessage,
  buildOrderLines,
  buildOrderNotes,
  buildRegisteredMessage,
  hasRequiredData,
  isReservation,
  orderTotal,
  toPrismaOrderType,
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly ordersGateway: OrdersGateway,
  ) { }

  /**
   * Auditoría del Inbox: guarda en orden los mensajes de un intercambio que no pasó por la IA.
   * Nunca lanza: un fallo al registrar no debe afectar a la respuesta ya enviada.
   */
  private async recordChat(
    restaurantId: string,
    customerPhone: string,
    entries: Array<{ role: string; message: string }>,
  ): Promise<void> {
    try {
      // Inserciones secuenciales: createdAt creciente preserva el orden en el Inbox
      for (const { role, message } of entries) {
        await this.prisma.chatHistory.create({ data: { restaurantId, customerPhone, role, message } });
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

    const cleanTo = to.replace(/\D/g, '');

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
    const cleanTo = to.replace(/\D/g, '');

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

      // 2.4. Handover humano: el equipo atiende esta conversación desde el Inbox. Se registra el
      //      mensaje del cliente (sin transcribir audio ni llamar a la IA) y no se responde nada.
      if ((await getHandoverState(this.prisma, restaurant.id, senderNumber)).botPaused) {
        this.logger.log(`👤 [${restaurant.name}] Bot pausado para [${senderNumber}]: lo atiende un humano`);
        const incomingText = extractPlainText(incomingMsg) || (incomingMsg.audio?.id ? '🎙️ [Nota de voz]' : '');
        if (incomingText) await this.recordChat(restaurant.id, senderNumber, [{ role: CHAT_ROLE_USER, message: incomingText }]);
        return;
      }

      // 2.5. Escudo de horario: con el local cerrado (botón de emergencia o fuera de horario)
      //      no se transcribe audio ni se llama a la IA; se responde con el mensaje de cierre.
      if (isRestaurantClosed(restaurant)) {
        this.logger.log(`🌙 [${restaurant.name}] Local cerrado: respuesta estática a [${senderNumber}] sin IA`);
        const closedMessage = buildClosedMessage(restaurant);
        await this.sendTextMessage(targetPhoneId, targetToken, senderNumber, closedMessage, isBaileys);
        // Auditoría del Inbox: el audio no se transcribe con el local cerrado
        const incomingText = extractPlainText(incomingMsg) || (incomingMsg.audio?.id ? '🎙️ [Nota de voz]' : '');
        await this.recordChat(restaurant.id, senderNumber, [
          ...(incomingText ? [{ role: CHAT_ROLE_USER, message: incomingText }] : []),
          { role: CHAT_ROLE_MODEL, message: closedMessage },
        ]);
        return;
      }

      // 3. Extraer el texto del mensaje según su tipo
      let messageText = extractPlainText(incomingMsg);
      if (!messageText && incomingMsg.audio?.id) {
        this.logger.log(`🎙️ Mensaje de voz recibido (Media ID: ${incomingMsg.audio.id}). Descargando y transcribiendo...`);
        try {
          const audioBuffer = await this.downloadMedia(incomingMsg.audio.id, targetToken);
          messageText = await this.aiService.transcribeAudio(
            audioBuffer,
            incomingMsg.audio.mime_type || 'audio/ogg',
          );
          this.logger.log(`🎙️ Audio transcrito con éxito: "${messageText}"`);
        } catch (audioErr: any) {
          this.logger.error(`❌ Error al procesar audio: ${audioErr?.message || audioErr}`);
        }
      }

      if (!messageText || !messageText.trim()) {
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
          { role: CHAT_ROLE_USER, message: messageText.trim() },
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
          const caption = '📄 Aquí tienes nuestro menú. ¡Dime qué te gustaría ordenar!';
          await this.sendDocumentMessage(targetPhoneId, targetToken, senderNumber, pdfUrl, "Menu.pdf", caption, isBaileys);
          await this.recordChat(restaurant.id, senderNumber, [
            { role: CHAT_ROLE_USER, message: messageText.trim() },
            { role: CHAT_ROLE_MODEL, message: `${caption}\n📎 ${pdfUrl}` },
          ]);
          return; // Detiene la ejecución de IA
        }

        await this.sendTextMessage(targetPhoneId, targetToken, senderNumber, finalResponse, isBaileys);
        await this.recordChat(restaurant.id, senderNumber, [
          { role: CHAT_ROLE_USER, message: messageText.trim() },
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

      // Guardar el mensaje del usuario en el historial
      await this.prisma.chatHistory.create({
        data: {
          restaurantId: restaurant.id,
          customerPhone: senderNumber,
          role: 'user',
          message: messageText.trim(),
        },
      });

      // 5. Procesar el mensaje con Inteligencia Artificial (Gemini)
      const aiResult = await this.aiService.parseOrderIntent(
        messageText.trim(),
        menuString,
        chatHistory,
        restaurant.name,
      );

      // Log de la estructura extraída por IA
      console.log('JSON Extraído por IA:', JSON.stringify(aiResult, null, 2));

      // 6. Flujo de pedido / reserva con confirmación estricta.
      //    El backend decide con los datos (no solo con el flag de la IA) y calcula el total con precios de la BD.
      let finalResponse = aiResult.responseToUser;

      if (aiResult.intent === 'ORDER' || aiResult.intent === 'RESERVATION') {
        const lines = buildOrderLines(aiResult.items, menuItems);
        const complete = hasRequiredData(aiResult, lines);

        if (complete && aiResult.customerConfirmed) {
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
            finalResponse = `✅ Tu pedido #${duplicate.id.slice(0, 8).toUpperCase()} ya está registrado. ¡No te preocupes, no lo duplicamos!`;
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

            // Emitir el evento por WebSocket al KDS (Kitchen Display System)
            this.ordersGateway.emitNewOrder(restaurant.id, newOrder);

            finalResponse = `${aiResult.responseToUser}\n\n${buildRegisteredMessage(aiResult, newOrder.id)}`.trim();

            // Cobro: datos de pago del local (Nequi, etc.) para que el cliente sepa a dónde transferir
            if (!isReservation(aiResult) && restaurant.paymentDetails?.trim()) {
              finalResponse += `\n\n💳 *Datos de pago:*\n${restaurant.paymentDetails.trim()}`;
            }
          }
        } else if (complete && aiResult.readyToConfirm) {
          // 6.2. Datos completos: pedir confirmación con el total exacto (aún NO se crea el pedido)
          finalResponse = `${aiResult.responseToUser}\n\n${buildConfirmationMessage(aiResult, lines)}`.trim();
        }
        // 6.3. Si faltan datos, la respuesta de la IA ya está pidiendo lo que falta
      }

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

      // Guardar la respuesta del modelo en el historial de chat
      await this.prisma.chatHistory.create({
        data: {
          restaurantId: restaurant.id,
          customerPhone: senderNumber,
          role: 'model',
          message: finalResponse,
        },
      });
    } catch (error: any) {
      this.logger.error(`❌ Error procesando webhook entrante de Meta: ${error?.message || error}`, error?.stack);
    }
  }
}
