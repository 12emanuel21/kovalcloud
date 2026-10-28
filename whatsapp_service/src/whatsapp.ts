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
import { notifySessionNumber, sendToNestjs } from './nestjsBridge';

dotenv.config();

const AUTH_FOLDER = process.env.AUTH_FOLDER || 'auth_info_baileys';
const AUTH_ROOT = path.resolve(process.cwd(), AUTH_FOLDER);

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED';

/**
 * Una sesión de WhatsApp Web por restaurante (multi-tenant).
 * Las credenciales de cada una viven en AUTH_FOLDER/<restaurantId>/.
 */
interface Session {
  restaurantId: string;
  sock: WASocket | null;
  status: ConnectionStatus;
  qr: string | null;
  user: { id?: string; name?: string } | null;
  // Mapa dígitos -> JID original. WhatsApp puede identificar contactos por LID (@lid)
  // en vez de por número (@s.whatsapp.net); el backend solo recibe los dígitos,
  // así que hay que recordar el sufijo real para poder responder.
  knownJids: Map<string, string>;
}

const sessions = new Map<string, Session>();

// El restaurantId se usa como nombre de carpeta: solo caracteres seguros (UUID, slug)
const RESTAURANT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidRestaurantId(restaurantId: string): boolean {
  return RESTAURANT_ID_PATTERN.test(restaurantId);
}

/** Número de la SIM vinculada a partir del JID propio: "573001234567:12@s.whatsapp.net" -> "573001234567" */
export function phoneFromJid(jid: string | undefined): string | null {
  const digits = (jid ?? '').split('@')[0].split(':')[0].replace(/\D/g, '');
  return /^\d{10,15}$/.test(digits) ? digits : null;
}

const authPathFor = (restaurantId: string) => path.join(AUTH_ROOT, restaurantId);

export function getSessionInfo(restaurantId: string) {
  const session = sessions.get(restaurantId);
  return {
    status: session?.status ?? ('DISCONNECTED' as ConnectionStatus),
    qr: session?.qr ?? null,
    user: session?.user ?? null,
  };
}

export function listSessions() {
  return [...sessions.values()].map((s) => ({ restaurantId: s.restaurantId, status: s.status }));
}

/**
 * Inicia (o reutiliza) la sesión de WhatsApp de un restaurante
 */
export async function connectToWhatsApp(restaurantId: string): Promise<Session> {
  if (!isValidRestaurantId(restaurantId)) {
    throw new Error('restaurantId inválido');
  }

  const existing = sessions.get(restaurantId);
  if (existing && existing.status !== 'DISCONNECTED') {
    return existing;
  }

  const session: Session = existing ?? {
    restaurantId,
    sock: null,
    status: 'DISCONNECTED',
    qr: null,
    user: null,
    knownJids: new Map(),
  };
  session.status = 'CONNECTING';
  sessions.set(restaurantId, session);

  const authPath = authPathFor(restaurantId);
  const { state, saveCreds } = await useMultiFileAuthState(authPath);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Koval Cloud', 'Chrome', '1.0.0'],
    syncFullHistory: false,
  });
  session.sock = sock;
  const tag = `[${restaurantId}]`;

  // Guardar credenciales ante cambios
  sock.ev.on('creds.update', saveCreds);

  // Manejador de actualizaciones de conexión
  sock.ev.on('connection.update', (update) => {
    // Un socket reemplazado (logout/reconexión) no debe pisar el estado del actual
    if (session.sock !== sock) return;
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      session.qr = qr;
      session.status = 'QR_READY';
      console.log(`\n📱 ${tag} Nuevo código QR generado (visible en el Dashboard > WhatsApp):`);
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      session.qr = null;
      session.user = null;
      session.status = 'DISCONNECTED';

      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;

      if (statusCode === DisconnectReason.loggedOut) {
        console.log(`🚫 ${tag} Sesión cerrada (Logged Out). Limpiando credenciales...`);
        session.sock = null;
        sessions.delete(restaurantId);
        removeAuthFolder(restaurantId);
        // Desvinculada desde el teléfono: la carta vuelve al teléfono del local
        void notifySessionNumber(restaurantId, null);
        return;
      }

      // Sin vincular (QR caducado sin escanear): no se reintenta para no dejar
      // sockets ociosos; el dueño genera uno nuevo desde el Dashboard.
      // restartRequired llega justo después de escanear el QR y sí debe reconectar.
      const isPaired = Boolean(state.creds.me);
      if (!isPaired && statusCode !== DisconnectReason.restartRequired) {
        console.log(`⌛ ${tag} QR sin escanear (${statusCode}). Sesión detenida hasta que se solicite de nuevo.`);
        session.sock = null;
        return;
      }

      console.log(`❌ ${tag} Conexión cerrada (${statusCode}). Reconectando en 3s...`);
      session.sock = null;
      setTimeout(() => {
        connectToWhatsApp(restaurantId).catch((e) => console.error(`${tag} Error reconectando:`, e));
      }, 3000);
    } else if (connection === 'open') {
      session.qr = null;
      session.status = 'CONNECTED';
      session.user = sock.user || null;
      console.log(`✅ ${tag} Conexión a WhatsApp establecida: ${sock.user?.name || sock.user?.id || 'Bot Koval'}`);
      // El backend guarda el número real de la SIM: la carta pública dirige pedidos y chats a esta línea
      const phoneNumber = phoneFromJid(sock.user?.id);
      if (phoneNumber) void notifySessionNumber(restaurantId, phoneNumber);
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
      session.knownJids.set(senderNumber, remoteJid);
      const pushName = msg.pushName || senderNumber;

      console.log(`📩 ${tag} Mensaje recibido de ${pushName} (${senderNumber}): "${messageText}"`);

      try {
        await sock.sendPresenceUpdate('composing', remoteJid);

        const messageId = msg.key.id || `baileys_${Date.now()}`;
        // Reenvío al adaptador de NestJS emulando Meta Cloud API
        await sendToNestjs(restaurantId, remoteJid, messageText, messageId, pushName);

        await sock.sendPresenceUpdate('paused', remoteJid);
      } catch (err) {
        console.error(`${tag} Error procesando mensaje para ${remoteJid}:`, err);
      }
    }
  });

  return session;
}

function removeAuthFolder(restaurantId: string) {
  const authPath = authPathFor(restaurantId);
  try {
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
    }
  } catch (e) {
    console.warn(`[${restaurantId}] Error eliminando credenciales:`, e);
  }
}

/**
 * Cierra la sesión de WhatsApp de un restaurante, limpia sus credenciales
 * y arranca una nueva para que pueda escanear otro QR
 */
export async function logoutWhatsApp(restaurantId: string): Promise<void> {
  console.log(`🔄 [${restaurantId}] Cerrando sesión de WhatsApp solicitada...`);
  const session = sessions.get(restaurantId);
  const sock = session?.sock;
  if (session) session.sock = null;
  sessions.delete(restaurantId);

  if (sock) {
    try {
      await sock.logout();
    } catch {
      sock.end(undefined);
    }
  }

  removeAuthFolder(restaurantId);
  // También cancela cualquier reintento pendiente que reportara la SIM anterior
  void notifySessionNumber(restaurantId, null);

  setTimeout(() => {
    connectToWhatsApp(restaurantId).catch((e) => console.error(`[${restaurantId}] Error reconectando:`, e));
  }, 1000);
}

/**
 * Al arrancar, reabre las sesiones ya vinculadas (carpetas con creds.json)
 */
export async function restoreSessions(): Promise<void> {
  if (!fs.existsSync(AUTH_ROOT)) return;

  const restaurantIds = fs
    .readdirSync(AUTH_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && isValidRestaurantId(d.name))
    .filter((d) => fs.existsSync(path.join(AUTH_ROOT, d.name, 'creds.json')))
    .map((d) => d.name);

  console.log(`📡 Restaurando ${restaurantIds.length} sesión(es) de WhatsApp...`);
  for (const restaurantId of restaurantIds) {
    try {
      await connectToWhatsApp(restaurantId);
    } catch (e) {
      console.error(`[${restaurantId}] Error restaurando sesión:`, e);
    }
  }
}

/**
 * Enviar mensaje saliente programático a un número o JID
 */
export interface DocumentPayload {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

export async function sendWhatsAppMessage(
  restaurantId: string,
  target: string,
  text: string,
  document?: DocumentPayload,
) {
  const session = sessions.get(restaurantId);
  if (!session?.sock || session.status !== 'CONNECTED') {
    throw new Error('El WhatsApp de este restaurante no está conectado actualmente.');
  }
  const { sock, knownJids } = session;

  let jid = target;
  if (!jid.includes('@')) {
    const cleanPhone = target.replace(/\D/g, '');
    jid = knownJids.get(cleanPhone) || `${cleanPhone}@s.whatsapp.net`;
  }

  if (document) {
    console.log(`📎 [${restaurantId}] Enviando documento a [${jid}]: ${document.filename} (${document.buffer.length} bytes)`);
    return await sock.sendMessage(jid, {
      document: document.buffer,
      fileName: document.filename,
      mimetype: document.mimetype,
      caption: text || undefined,
    });
  }

  console.log(`📤 [${restaurantId}] Enviando mensaje a [${jid}]: "${text.replace(/\n/g, ' ')}"`);
  return await sock.sendMessage(jid, { text });
}
