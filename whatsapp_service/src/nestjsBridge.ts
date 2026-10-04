import axios from 'axios';

// Tu backend NestJS debe estar corriendo en el puerto 4000
const NESTJS_WEBHOOK_URL = process.env.NESTJS_WEBHOOK_URL || 'http://localhost:4000/meta/webhook';

export async function sendToNestjs(senderPhone: string, messageText: string, messageId: string) {
    try {
        // ID ficticio o el de tu negocio
        const businessAccountId = '1931931007422144'; 
        const phoneNumberId = '1124970087377044'; // El configurado en Meta

        // Limpiamos el sufijo @s.whatsapp.net
        const cleanSender = senderPhone.replace(/\D/g, '');

        // Construimos el payload imitando a Meta Graph API v22.0
        const payload = {
            object: "whatsapp_business_account",
            entry: [{
                id: businessAccountId,
                changes: [{
                    value: {
                        messaging_product: "whatsapp",
                        metadata: {
                            display_phone_number: "573239999064",
                            phone_number_id: phoneNumberId
                        },
                        contacts: [{
                            profile: { name: "Cliente Baileys" },
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
            headers: { 'Content-Type': 'application/json' }
        });

        console.log(`[NestJS Bridge] Mensaje enviado a backend. Status: ${response.status}`);
    } catch (error: any) {
        console.error(`[NestJS Bridge Error] Error al conectar con NestJS: ${error.message}`);
    }
}
