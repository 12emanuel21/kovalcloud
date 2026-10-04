import { Injectable, Logger } from '@nestjs/common';
import { generateObject, generateText, ModelMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { WAITER_SYSTEM_PROMPT } from '../meta-whatsapp/prompts/waiter.prompt';


const PdfMenuSchema = z.object({
  categories: z.array(
    z.object({
      name: z.string().describe("Nombre de la categoría, ej: Pizzas, Bebidas, Postres"),
      items: z.array(
        z.object({
          name: z.string(),
          description: z.string().optional().describe("Descripción de los ingredientes si existe"),
          price: z.number().describe("Precio numérico entero, sin símbolos de moneda"),
        })
      ),
    })
  ),
});

const OrderIntentSchema = z.object({
  intent: z.enum(['ORDER', 'QUESTION', 'COMPLAINT', 'GREETING']),
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number(),
      notes: z.string().optional(),
    }),
  ),
  responseToUser: z.string(),
  sendMenuPdf: z
    .boolean()
    .optional()
    .default(false)
    .describe('True única y estrictamente si el cliente pide el menú, la carta, o pregunta qué venden o qué opciones hay'),
});

export type OrderIntent = z.infer<typeof OrderIntentSchema>;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  async transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
    this.logger.log('🎙️ Transcribiendo audio con Gemini...');
    // Limpiamos el mimeType por si trae codecs (ej. "audio/ogg; codecs=opus" -> "audio/ogg")
    const cleanMimeType = mimeType.split(';')[0];

    const { text } = await generateText({
      model: google('gemini-2.5-flash'), // O gemini-1.5-flash según la versión configurada
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Transcribe exactamente lo que dice este audio. Solo devuelve la transcripción en español, sin comillas, introducciones ni comentarios extra. Si no entiendes nada, devuelve un string vacío.',
            },
            {
              type: 'file',
              data: audioBuffer,
              mediaType: cleanMimeType,
            },
          ],
        },
      ],
    });
    return text.trim();
  }

  async parseOrderIntent(
    userMessage: string,
    menuContext: string,
    chatHistory: Array<{ role: string; message: string }> = [],
    restaurantName: string = 'nuestro restaurante',
  ): Promise<OrderIntent> {
    this.logger.log('Parsing order intent for message: ' + userMessage);

    const historyMessages: ModelMessage[] = chatHistory.map((item) => ({
      role: (item.role === 'model' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: item.message,
    }));

    // Obtenemos la hora actual en Colombia para inyectarla al contexto
    const currentTime = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });

    const { object } = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: OrderIntentSchema,
      system: WAITER_SYSTEM_PROMPT
        .replace('{RESTAURANT_NAME}', restaurantName)
        .replace('{CURRENT_TIME}', currentTime)
        .replace('{MENU}', menuContext),
      messages: [
        ...historyMessages,
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    this.logger.log('Parsed intent: ' + object.intent);
    return object;
  }

  async extractMenuFromPdf(pdfBuffer: Buffer) {
    this.logger.log("📄 Extrayendo menú desde PDF con Gemini 2.5 Flash...");
    
    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: PdfMenuSchema,
      system: "Eres un sistema automatizado experto en digitalización de menús de restaurantes. Tu tarea es analizar el PDF adjunto y extraer su estructura a JSON. Agrupa los productos en sus categorías lógicas. Limpia los precios para que sean solo números (ej: de $25.000 a 25000). Si el nombre del producto incluye la descripción, sepáralos correctamente.",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Extrae todo el menú de este documento." },
            { type: "file", data: pdfBuffer, mediaType: "application/pdf" },
          ],
        },
      ],
    });

    this.logger.log(`✅ Extracción completada: ${object.categories.length} categorías encontradas.`);
    return object;
  }

}
