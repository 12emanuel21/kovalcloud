import { Injectable, Logger } from '@nestjs/common';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

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
});

export type OrderIntent = z.infer<typeof OrderIntentSchema>;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  async parseOrderIntent(
    userMessage: string,
    menuContext: string,
  ): Promise<OrderIntent> {
    this.logger.log('Parsing order intent for message: ' + userMessage);

    const { object } = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: OrderIntentSchema,
      system:
        'Eres un mesero virtual estricto y amable para un restaurante. ' +
        'Solo puedes ofrecer productos que estén en el menú proporcionado. ' +
        'Si el cliente pide algo que no está en el menú, indícale amablemente que no está disponible y sugiérele alternativas del menú. ' +
        'Responde siempre en español y de forma cortés.\n\n' +
        'MENÚ DISPONIBLE:\n' +
        menuContext,
      prompt: userMessage,
    });

    this.logger.log('Parsed intent: ' + object.intent);
    return object;
  }
}
