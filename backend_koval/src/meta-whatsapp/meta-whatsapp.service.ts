import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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

  constructor(private readonly prisma: PrismaService) {}

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
  ): Promise<any> {
    if (!phoneNumberId || !token) {
      this.logger.warn('⚠️ No se puede enviar mensaje: phoneNumberId o token no proporcionados.');
      return;
    }

    const cleanTo = to.replace(/\D/g, '');
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

      // 4. Reenviar mensaje al bot de Botpress asignado al restaurante
      const botId = restaurant.botpressBotId || 'koval-pizzeria-bot';
      const replies = await this.forwardToBotpress(botId, senderNumber, messageText.trim());

      // 5. Enviar cada respuesta a Meta Graph API v22.0 usando las credenciales del restaurante
      for (const reply of replies) {
        await this.sendTextMessage(targetPhoneId, targetToken, senderNumber, reply);
      }
    } catch (error: any) {
      this.logger.error(`❌ Error procesando webhook entrante de Meta: ${error?.message || error}`, error?.stack);
    }
  }
}