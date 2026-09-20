import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BOTPRESS_URL = process.env.BOTPRESS_URL || 'http://localhost:3000';
const DEFAULT_BOT_ID = process.env.BOTPRESS_BOT_ID || 'koval-pizzeria-bot';

export interface BotpressResponse {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface ConverseApiResponse {
  responses: BotpressResponse[];
}

/**
 * Reenvía un mensaje de texto de WhatsApp al motor conversacional de Botpress v12
 * @param senderNumber Número o identificador del remitente en WhatsApp
 * @param messageText Texto del mensaje recibido
 * @param targetBotId ID del bot específico en Botpress (opcional, fallback a env/default)
 * @returns Array con los textos de respuesta generados por el bot
 */
export async function sendMessageToBotpress(
  senderNumber: string,
  messageText: string,
  targetBotId?: string
): Promise<string[]> {
  const botId = targetBotId || DEFAULT_BOT_ID;

  try {
    const cleanSender = senderNumber.replace(/\D/g, '') || 'whatsapp_user';
    const endpoint = `${BOTPRESS_URL}/api/v1/bots/${botId}/converse/${cleanSender}`;

    const response = await axios.post<ConverseApiResponse>(
      endpoint,
      {
        type: 'text',
        text: messageText,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      }
    );

    const botResponses = response.data?.responses || [];
    const replyTexts: string[] = [];

    for (const res of botResponses) {
      if (res.text && typeof res.text === 'string' && res.text.trim()) {
        replyTexts.push(res.text.trim());
      }
    }

    return replyTexts;
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown; status?: number }; message?: string };
    console.error(
      `⚠️ Error comunicando con Botpress [${botId}]:`,
      err.response?.data || err.message || error
    );
    return [
      '⚠️ Hola, estamos experimentando una breve interrupción en nuestro asistente virtual. Puedes consultar nuestro menú digital en: http://localhost:3030/menu/pizzeria-napoles',
    ];
  }
}
