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
import { sendToNestjs } from './nestjsBridge';

dotenv.config();

const AUTH_FOLDER = process.env.AUTH_FOLDER || 'auth_info_baileys';

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED';

let sock: WASocket | null = null;
let currentStatus: ConnectionStatus = 'DISCONNECTED';
let currentQRCode: string | null = null;
let connectedUser: { id?: string; name?: string } | null = null;

export const getWhatsAppStatus = (): ConnectionStatus => currentStatus;
export const getQRCode = (): string | null => currentQRCode;
export const getConnectedUser = () => connectedUser;

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

        const messageId = msg.key.id || `baileys_${Date.now()}`;
        // Reenvío al adaptador de NestJS emulando Meta Cloud API
        await sendToNestjs(remoteJid, messageText, messageId);

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
