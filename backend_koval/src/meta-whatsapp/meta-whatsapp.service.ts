import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { OrdersGateway } from '../orders/orders.gateway';
import { OrderStatus } from '@prisma/client';
import { MetaWebhookPayloadDto } from './dto/webhook-payload.dto';

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
   * Envía un mensaje de texto oficial a WhatsApp utilizando Meta Graph API v22.0
   * @param phoneNumberId ID del número de teléfono del restaurante en Meta Cloud API
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
    
    if (isBaileys) {
      this.logger.log(`📤 [Baileys] Enviando mensaje a [${cleanTo}]: "${body.replace(/\n/g, ' ')}"`);
      try {
        const whatsappServiceUrl = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:5000/send';
        const response = await fetch(whatsappServiceUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: cleanTo,
            text: body,
          }),
        });
        return await response.json();
      } catch (error: any) {
        this.logger.error(`❌ [Baileys] Error enviando mensaje a ${cleanTo}: ${error.message}`);
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
   * @param phoneId ID del número de teléfono en Meta Cloud API
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
        const buffer = isLocalFile
          ? fsLib.readFileSync(filePathOrUrl)
          : Buffer.from(await (await fetch(filePathOrUrl)).arrayBuffer());
        const whatsappServiceUrl = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:5000/send';
        const response = await fetch(whatsappServiceUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: cleanTo,
            document: buffer.toString('base64'),
            filename,
            mimetype: 'application/pdf',
            caption,
          }),
        });
        return await response.json();
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
  async processIncomingWebhook(payload: MetaWebhookPayloadDto | any, verifyToken: string): Promise<void> {
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
      const isBaileys = displayPhoneNumber === 'BAILEYS_GATEWAY';

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
        where: {
          OR: searchConditions,
        },
      });

      if (!restaurant) {
        this.logger.warn(
          `⚠️ [Multi-Tenant] No se encontró ningún restaurante registrado en BD para verifyToken="${verifyToken}" / phoneNumberId="${phoneNumberId}"`,
        );
        return;
      }

      // 2. Validar que el restaurante tenga configuradas sus credenciales oficiales de Meta
      const targetToken = restaurant.whatsappToken;
      const targetPhoneId = restaurant.whatsappPhoneId || phoneNumberId;

      if (!targetToken || !targetPhoneId) {
        this.logger.warn(
          `⚠️ [Multi-Tenant] El restaurante "${restaurant.name}" (${restaurant.slug}) no tiene configurado whatsappToken o whatsappPhoneId en el Dashboard. Abortando despacho.`,
        );
        return;
      }

      // 3. Extraer el texto del mensaje según su tipo
      let messageText = '';
      if (incomingMsg.text?.body) {
        messageText = incomingMsg.text.body;
      } else if (incomingMsg.audio?.id) {
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
      } else if (incomingMsg.image?.caption) {
        messageText = incomingMsg.image.caption;
      } else if (incomingMsg.video?.caption) {
        messageText = incomingMsg.video.caption;
      } else if (incomingMsg.document?.caption) {
        messageText = incomingMsg.document.caption;
      } else if (incomingMsg.interactive?.button_reply?.title) {
        messageText = incomingMsg.interactive.button_reply.title;
      } else if (incomingMsg.interactive?.list_reply?.title) {
        messageText = incomingMsg.interactive.list_reply.title;
      } else if (incomingMsg.button?.text) {
        messageText = incomingMsg.button.text;
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
        where: { isAvailable: true, restaurantId: restaurant.id },
      });

      const lowerMsg = messageText.toLowerCase().trim();

      // --- 3.5 COMANDO DE SISTEMA: RESET ---
      if (lowerMsg === 'reset') {
        this.logger.log(`🧹 Ejecutando comando de reset para ${senderNumber}`);
        await this.prisma.chatHistory.deleteMany({
          where: {
            restaurantId: restaurant.id,
            customerPhone: senderNumber,
          },
        });
        await this.sendTextMessage(
          targetPhoneId,
          targetToken,
          senderNumber,
          '🧠 Memoria borrada. Contexto limpio. ¿En qué puedo ayudarte de nuevo?',
          isBaileys
        );
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
          return; // Detiene la ejecución de IA
        }

        await this.sendTextMessage(targetPhoneId, targetToken, senderNumber, finalResponse, isBaileys);
        return; // Detiene la ejecución aquí (Costo IA: $0)
      }
      // --- FIN INTERCEPTOR ---

      const menuString = menuItems
        .map((i) => `ID: ${i.id} | Nombre: ${i.name} | Precio: ${i.price}`)
        .join('\n');

      // 4.5. Obtener historial de conversación previo (últimos 20 mensajes)
      const rawHistory = await this.prisma.chatHistory.findMany({
        where: {
          restaurantId: restaurant.id,
          customerPhone: senderNumber,
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

      // 6. Procesar la orden si la intención es ORDER
      let finalResponse = aiResult.responseToUser;

      if (aiResult.intent === 'ORDER' && aiResult.items && aiResult.items.length > 0) {
        this.logger.log(`🛒 Procesando pedido real para el restaurante ${restaurant.id}...`);

        // 6.1. Calcular el total cruzando los items de la IA con el menú de la BD
        let totalAmount = 0;
        const orderItemsData: Array<{
          menuItemId: string;
          quantity: number;
          unitPrice: number;
          subtotal: number;
        }> = [];

        for (const item of aiResult.items) {
          const menuItem = menuItems.find((m) => m.id === item.productId);
          if (menuItem) {
            const subtotal = menuItem.price * item.quantity;
            totalAmount += subtotal;
            orderItemsData.push({
              menuItemId: menuItem.id,
              quantity: item.quantity,
              unitPrice: menuItem.price,
              subtotal: subtotal,
            });
          }
        }

        if (orderItemsData.length > 0) {
          // 6.2. Guardar la orden en Prisma
          const newOrder = await this.prisma.order.create({
            data: {
              restaurantId: restaurant.id,
              customerName: incomingMsg.from || 'Cliente WhatsApp',
              customerPhone: incomingMsg.from,
              channel: 'WHATSAPP',
              total: totalAmount,
              status: OrderStatus.PENDING,
              items: {
                create: orderItemsData,
              },
            },
            include: { items: { include: { menuItem: true } } },
          });

          this.logger.log(`✅ Orden guardada en BD: ${newOrder.id}`);

          // 6.3. Emitir el evento por WebSocket al KDS (Kitchen Display System)
          this.ordersGateway.emitNewOrder(restaurant.id, newOrder);

          // 6.4. Anexar confirmación de precio al usuario
          finalResponse += `\n\nEl total de su pedido es de $${totalAmount.toLocaleString('es-CO')}. ¡En breve comenzamos a prepararlo!`;
        }
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
          this.logger.warn(`⚠️ PDF de menú no encontrado en ${menuPdfPath}, se envía solo texto.`);
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
