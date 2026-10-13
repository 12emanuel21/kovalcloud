import axios from 'axios';

// Tu backend NestJS debe estar corriendo en el puerto 4000
const NESTJS_WEBHOOK_URL = process.env.NESTJS_WEBHOOK_URL || 'http://localhost:4000/meta/webhook';

/**
 * Reenvía un mensaje entrante al backend emulando un webhook de Meta Graph API v22.0.
 * El restaurante dueño de la sesión viaja en la cabecera x-restaurant-id
 * (el backend solo la acepta junto con la clave interna x-api-key).
 */
export async function sendToNestjs(
    restaurantId: string,
    senderPhone: string,
    messageText: string,
    messageId: string,
    pushName?: string,
) {
    try {
        // Limpiamos el sufijo @s.whatsapp.net
        const cleanSender = senderPhone.replace(/\D/g, '');

        // Construimos el payload imitando a Meta Graph API v22.0.
        // En sesiones Baileys no hay WABA ni phone_number_id reales: se usa el restaurantId.
        const payload = {
            object: "whatsapp_business_account",
            entry: [{
                id: restaurantId,
                changes: [{
                    value: {
                        messaging_product: "whatsapp",
                        metadata: {
                            display_phone_number: "",
                            phone_number_id: restaurantId
                        },
                        contacts: [{
                            profile: { name: pushName || "Cliente Baileys" },
                            wa_id: cleanSender
                        }],
                        messages: [{
                            from: cleanSender,
                            id: messageId,
                            timestamp: Math.floor(Date.now() / 1000).toString(),
                            text: { body: messageText },
                            type: "text"
                        }]
                    },
                    field: "messages"
                }]
            }]
        };

        const response = await axios.post(NESTJS_WEBHOOK_URL, payload, {
            headers: {
                'Content-Type': 'application/json',
                'x-source': 'baileys',
                'x-restaurant-id': restaurantId,
                'x-api-key': process.env.INTERNAL_API_KEY || '',
            }
        });

        console.log(`[NestJS Bridge] [${restaurantId}] Mensaje enviado a backend. Status: ${response.status}`);
    } catch (error: any) {
        console.error(`[NestJS Bridge Error] [${restaurantId}] Error al conectar con NestJS: ${error.message}`);
    }
}
