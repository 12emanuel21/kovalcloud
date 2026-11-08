import { Injectable, Logger } from '@nestjs/common';
import { generateObject, generateText, ModelMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { WAITER_SYSTEM_PROMPT } from '../meta-whatsapp/prompts/waiter.prompt';
import { RESTAURANT_TIMEZONE } from '../restaurants/business-hours';


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
  intent: z
    .enum(['ORDER', 'RESERVATION', 'ORDER_STATUS', 'QUESTION', 'COMPLAINT', 'GREETING'])
    .describe('ORDER_STATUS = pregunta cómo va un pedido ya hecho; COMPLAINT = queja o reclamo real sobre un pedido o el servicio'),
  items: z
    .array(
      z.object({
        productId: z.string().describe('ID exacto del inventario'),
        // Sin tope de cantidad. Sin .int().positive(): un 0 o un decimal de la IA (p. ej. con un
        // producto que no existe) tumbaba toda la respuesta; buildOrderLines descarta los inválidos
        quantity: z.number(),
        notes: z.string().optional(),
      }),
    )
    .default([])
    .describe(
      'Estado ACTUAL del carrito (lo quitado o cambiado ya no va). Si addToPreviousOrder = true, SOLO los productos nuevos a agregar',
    ),
  addToPreviousOrder: z
    .boolean()
    .default(false)
    .describe('True si el pedido ya quedó registrado (✅) y el cliente quiere agregarle productos'),
  orderType: z
    .enum(['DELIVERY', 'DINE_IN', 'TAKEAWAY'])
    .optional()
    .describe('DELIVERY = domicilio, DINE_IN = reserva de mesa en el local, TAKEAWAY = recoger'),
  customerName: z.string().optional(),
  deliveryAddress: z.string().optional().describe('Dirección completa, solo para DELIVERY'),
  neighborhood: z.string().optional().describe('Barrio o sector del domicilio (define la zona y el valor del envío), solo para DELIVERY'),
  reservation: z
    .object({
      // Opcionales: una reserva a medio pedir (solo personas) no debe romper la respuesta
      people: z.number().optional().describe('Número de personas'),
      time: z.string().optional().describe('Hora de llegada, ej: "8:00 pm"'),
    })
    .optional()
    .describe('Solo para DINE_IN'),
  paymentMethod: z
    .enum(['CASH', 'TRANSFER'])
    .optional()
    .describe(
      'Solo DELIVERY/TAKEAWAY y solo si el cliente lo dijo: CASH = efectivo al recibir o recoger, TRANSFER = transferencia (Nequi, Daviplata...)',
    ),
  readyToConfirm: z
    .boolean()
    .default(false)
    .describe('True cuando ya se hizo el upselling y están todos los datos del tipo de pedido y el método de pago'),
  customerConfirmed: z
    .boolean()
    .default(false)
    .describe('True SOLO si el último mensaje del cliente acepta explícitamente la confirmación ("¿Confirmas?") enviada antes'),
  responseToUser: z.string(),
  sendMenuLink: z
    .boolean()
    .optional()
    .default(false)
    .describe('True si el cliente pide el menú, la carta, precios, opciones o qué venden (se envía la carta web en vivo)'),
  sendMenuPdf: z
    .boolean()
    .optional()
    .default(false)
    .describe('True SOLO si el cliente pide explícitamente la carta en PDF o como archivo/documento'),
});

export type OrderIntent = z.infer<typeof OrderIntentSchema>;


/** Franja del día en la hora del local, para un saludo natural sin decir la hora */
export function dayPartOf(date: Date, timeZone = RESTAURANT_TIMEZONE): 'mañana' | 'tarde' | 'noche' {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(date));
  if (hour >= 5 && hour < 12) return 'mañana';
  if (hour >= 12 && hour < 19) return 'tarde';
  return 'noche';
}

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
      // "agent" (el equipo escribió desde el Inbox) también es la voz del local
      role: (item.role === 'model' || item.role === 'agent' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: item.message,
    }));

    // Solo la franja del día (mañana/tarde/noche): con la hora exacta el modelo la recitaba en el saludo
    const dayPart = dayPartOf(new Date());

    const request = {
      model: google('gemini-2.5-flash'),
      schema: OrderIntentSchema,
      system: WAITER_SYSTEM_PROMPT
        .replace('{RESTAURANT_NAME}', restaurantName)
        .replace('{DAY_PART}', dayPart)
        .replace('{MENU}', menuContext),
      messages: [
        ...historyMessages,
        {
          role: 'user' as const,
          content: userMessage,
        },
      ],
    };

    // Un JSON que no cumple el esquema (o un fallo puntual de Gemini) se reintenta una vez;
    // si vuelve a fallar, quien llama responde con un mensaje de respaldo (el bot nunca calla)
    let object: OrderIntent;
    try {
      ({ object } = await generateObject(request));
    } catch (error: any) {
      this.logger.warn(`⚠️ La IA no devolvió una respuesta válida, reintentando: ${error?.message || error}`);
      ({ object } = await generateObject(request));
    }

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
