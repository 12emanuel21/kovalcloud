import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { sendMessageToBotpress } from './botpressBridge';

dotenv.config();

const AUTH_FOLDER = process.env.AUTH_FOLDER || 'auth_info_baileys';
const API_URL = process.env.API_URL || 'http://localhost:4000';
const DEFAULT_RESTAURANT_ID = process.env.RESTAURANT_ID || '8a23ecc8-788f-43fd-a5d6-d3f83ab5316d';

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED';

let sock: WASocket | null = null;
let currentStatus: ConnectionStatus = 'DISCONNECTED';
let currentQRCode: string | null = null;
let connectedUser: { id?: string; name?: string } | null = null;
let cachedBotId: string | null = null;

export const getWhatsAppStatus = (): ConnectionStatus => currentStatus;
export const getQRCode = (): string | null => currentQRCode;
export const getConnectedUser = () => connectedUser;

/**
 * Consulta dinámicamente el bot ID asignado al restaurante en la API de NestJS
 */
async function resolveRestaurantBotId(): Promise<string> {
  try {
    const res = await axios.get(`${API_URL}/restaurants/${DEFAULT_RESTAURANT_ID}`, { timeout: 4000 });
    const botId = res.data?.botpressBotId;
    if (typeof botId === 'string' && botId.trim().length > 0) {
      cachedBotId = botId.trim();
      return botId.trim();
    }
  } catch {
    // Fallback si la API no está disponible
  }

  if (cachedBotId) {
    return cachedBotId;
  }

  return process.env.BOTPRESS_BOT_ID || 'koval-pizzeria-bot';
}

/**
 * Inicializa y gestiona la conexión con WhatsApp mediante Baileys
 */
export async function connectToWhatsApp(): Promise<WASocket> {
  currentStatus = 'CONNECTING';
  const authPath = path.resolve(process.cwd(), AUTH_FOLDER);
  const { state, saveCreds } = await useMultiFileAuthState(authPath);

  const socketLogger = pino({ level: 'silent' });

  sock = makeWASocket({
    auth: state,
    logger: socketLogger,
    printQRInTerminal: false,
    browser: ['Koval Cloud', 'Chrome', '1.0.0'],
    syncFullHistory: false,
  });

  // Guardar credenciales ante cambios
  sock.ev.on('creds.update', saveCreds);

  // Manejador de actualizaciones de conexión
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQRCode = qr;
      currentStatus = 'QR_READY';
      console.log('\n==================================================');
      console.log('📱 ESCANEA ESTE CÓDIGO QR EN TU WHATSAPP:');
      console.log('==================================================\n');
      qrcode.generate(qr, { small: true });
      console.log('\n(También puedes consultarlo en el Dashboard: http://localhost:3030/dashboard/whatsapp)\n');
    }

    if (connection === 'close') {
      currentQRCode = null;
      connectedUser = null;

      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (statusCode === DisconnectReason.loggedOut) {
        currentStatus = 'DISCONNECTED';
        console.log('🚫 Sesión cerrada (Logged Out). Limpiando credenciales...');
        try {
          if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
          }
        } catch (e) {
          console.warn('Error limpiando auth folder:', e);
        }
      } else {
        currentStatus = 'DISCONNECTED';
        console.log(
          `❌ Conexión de WhatsApp cerrada (${statusCode}). Reconectando en 3s...`
        );
        setTimeout(() => {
          connectToWhatsApp();
        }, 3000);
      }
    } else if (connection === 'open') {
      currentQRCode = null;
      currentStatus = 'CONNECTED';
      connectedUser = sock?.user || null;
      console.log('\n✅ ¡Conexión exitosa a WhatsApp establecida!');
      console.log(`🤖 Usuario: ${sock?.user?.name || sock?.user?.id || 'Bot Koval'}\n`);
    }
  });

  // Manejador de mensajes entrantes
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const remoteJid = msg.key.remoteJid;
      if (!remoteJid || remoteJid.includes('@broadcast') || remoteJid.includes('status@broadcast')) {
        continue;
      }

      const messageText =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        '';

      if (!messageText.trim()) continue;

      const senderNumber = remoteJid.split('@')[0];
      const pushName = msg.pushName || senderNumber;

      console.log(`📩 Mensaje recibido de ${pushName} (${senderNumber}): "${messageText}"`);

      try {
        await sock?.sendPresenceUpdate('composing', remoteJid);

        const activeBotId = await resolveRestaurantBotId();
        const responses = await sendMessageToBotpress(senderNumber, messageText, activeBotId);

        for (const reply of responses) {
          await sock?.sendMessage(remoteJid, { text: reply });
          console.log(`🤖 Respuesta enviada a ${senderNumber} [Bot: ${activeBotId}]: "${reply.slice(0, 60)}..."`);
        }

        await sock?.sendPresenceUpdate('paused', remoteJid);
      } catch (err) {
        console.error(`Error procesando mensaje para ${remoteJid}:`, err);
      }
    }
  });

  return sock;
}

/**
 * Cierra la sesión de WhatsApp y limpia credenciales para permitir nuevo escaneo
 */
export async function logoutWhatsApp(): Promise<void> {
  console.log('🔄 Cerrando sesión de WhatsApp solicitada...');
  try {
    if (sock) {
      try {
        await sock.logout();
      } catch {
        sock.end(undefined);
      }
    }
  } catch (e) {
    console.warn('Error al cerrar socket:', e);
  }

  sock = null;
  currentStatus = 'DISCONNECTED';
  currentQRCode = null;
  connectedUser = null;

  const authPath = path.resolve(process.cwd(), AUTH_FOLDER);
  try {
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
    }
  } catch (e) {
    console.warn('Error eliminando auth folder:', e);
  }

  setTimeout(() => {
    connectToWhatsApp();
  }, 1000);
}

/**
 * Enviar mensaje saliente programático a un número o JID
 */
export async function sendWhatsAppMessage(target: string, text: string) {
  if (!sock || currentStatus !== 'CONNECTED') {
    throw new Error('El servicio de WhatsApp no está conectado actualmente.');
  }

  let jid = target;
  if (!jid.includes('@s.whatsapp.net')) {
    const cleanPhone = target.replace(/\D/g, '');
    jid = `${cleanPhone}@s.whatsapp.net`;
  }

  console.log(`📤 Enviando notificación WhatsApp a [${jid}]: "${text.replace(/\n/g, ' ')}"`);
  return await sock.sendMessage(jid, { text });
}
