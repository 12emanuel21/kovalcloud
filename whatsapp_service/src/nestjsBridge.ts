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

// Base del backend a partir de NESTJS_WEBHOOK_URL (".../meta/webhook")
const NESTJS_BASE_URL = NESTJS_WEBHOOK_URL.replace(/\/meta\/webhook\/?$/, '');
const SESSION_SYNC_ATTEMPTS = 6;
const SESSION_SYNC_RETRY_MS = 5000;
// Último aviso por restaurante: un reintento viejo no debe pisar un estado más nuevo
const sessionSyncSeq = new Map<string, number>();

/**
 * Informa al backend el número real de la SIM vinculada (o null al desvincularse) para que la
 * carta pública envíe pedidos y chats a esa línea. Reintenta: al desplegar, Baileys puede
 * reabrir las sesiones antes de que el backend acepte conexiones.
 */
export async function notifySessionNumber(restaurantId: string, phoneNumber: string | null) {
    const seq = (sessionSyncSeq.get(restaurantId) ?? 0) + 1;
    sessionSyncSeq.set(restaurantId, seq);

    for (let attempt = 1; attempt <= SESSION_SYNC_ATTEMPTS; attempt++) {
        if (sessionSyncSeq.get(restaurantId) !== seq) return;
        try {
            await axios.post(
                `${NESTJS_BASE_URL}/internal/whatsapp/session`,
                { restaurantId, phoneNumber },
                {
                    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.INTERNAL_API_KEY || '' },
                    timeout: 10000,
                },
            );
            console.log(`[NestJS Bridge] [${restaurantId}] Número de la sesión sincronizado: ${phoneNumber ?? '(desvinculada)'}`);
            return;
        } catch (error: any) {
            const status = error?.response?.status;
            console.error(
                `[NestJS Bridge Error] [${restaurantId}] No se pudo sincronizar el número (intento ${attempt}/${SESSION_SYNC_ATTEMPTS}): ${status ?? error.message}`,
            );
            // 4xx (clave o datos inválidos) no se arregla reintentando
            if (status && status >= 400 && status < 500) return;
            if (attempt < SESSION_SYNC_ATTEMPTS) await new Promise((r) => setTimeout(r, SESSION_SYNC_RETRY_MS * attempt));
        }
    }
}
