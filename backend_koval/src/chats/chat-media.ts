import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { detectImageType } from '../menu-items/menu-item-image';

/**
 * Adjuntos de WhatsApp (imágenes, comprobantes, notas de voz, PDFs) por restaurante:
 * uploads/chat/<restaurantId>/<uuid>.<ext>. NO los publica nginx (los comprobantes son datos
 * financieros del cliente): se sirven con sesión por GET /restaurants/:id/chats/media/:file.
 */
export const CHAT_MEDIA_ROOT = path.join(process.cwd(), 'uploads', 'chat');
/** La carta en PDF que envía el bot (uploads/menus/<restaurantId>.pdf) */
export const MENU_PDF_MEDIA = 'menu.pdf';
export const MAX_CHAT_MEDIA_BYTES = 16 * 1024 * 1024;
/** Prefijo del id de un adjunto que Baileys ya subió (POST /internal/whatsapp/media) */
export const BAILEYS_MEDIA_PREFIX = 'baileys:';

export type ChatMediaKind = 'image' | 'audio' | 'document';

export interface StoredChatMedia {
  kind: ChatMediaKind;
  /** Nombre del archivo guardado (uuid.ext) */
  file: string;
  mime: string;
  name: string | null;
}

/** Tipos aceptados (mime base -> extensión). Lo demás no se guarda: solo se anota en el chat */
const AUDIO_TYPES: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/webm': 'webm',
};
const IMAGE_MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const EXTENSION_MIME: Record<string, string> = {
  ...IMAGE_MIME,
  pdf: 'application/pdf',
  ...Object.fromEntries(Object.entries(AUDIO_TYPES).map(([mime, ext]) => [ext, mime === 'audio/opus' ? 'audio/ogg' : mime])),
};

const FILE_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp|pdf|ogg|mp3|m4a|aac|amr|webm)$/;
const RESTAURANT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const baseMime = (mime: string | null | undefined) => (mime ?? '').split(';')[0].trim().toLowerCase();

/**
 * Tipo y extensión del adjunto según su contenido real (imágenes y PDF por "magic numbers")
 * y, para audio, su mimetype. null = no soportado.
 */
export function classifyChatMedia(buffer: Buffer, mime: string | null | undefined): { kind: ChatMediaKind; ext: string } | null {
  const image = detectImageType(buffer);
  if (image) return { kind: 'image', ext: image };
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return { kind: 'document', ext: 'pdf' };
  const audio = AUDIO_TYPES[baseMime(mime)];
  return audio ? { kind: 'audio', ext: audio } : null;
}

/** Guarda el adjunto; null si está vacío, es muy grande o no es de un tipo soportado */
export async function storeChatMedia(
  restaurantId: string,
  buffer: Buffer,
  mime: string | null | undefined,
  name?: string | null,
): Promise<StoredChatMedia | null> {
  if (!RESTAURANT_ID_PATTERN.test(restaurantId) || !buffer.length || buffer.length > MAX_CHAT_MEDIA_BYTES) return null;
  const type = classifyChatMedia(buffer, mime);
  if (!type) return null;
  const file = `${randomUUID()}.${type.ext}`;
  const dir = path.join(CHAT_MEDIA_ROOT, restaurantId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, file), buffer);
  return { kind: type.kind, file, mime: EXTENSION_MIME[type.ext], name: name?.trim().slice(0, 200) || null };
}

/**
 * Ruta física de un adjunto del restaurante (o de su carta en PDF), o null si el nombre no es
 * uno generado por nosotros: evita leer fuera de la carpeta del restaurante.
 */
export function chatMediaPath(restaurantId: string, file: string): string | null {
  if (!RESTAURANT_ID_PATTERN.test(restaurantId)) return null;
  if (file === MENU_PDF_MEDIA) return path.join(process.cwd(), 'uploads', 'menus', `${restaurantId}.pdf`);
  return FILE_PATTERN.test(file) ? path.join(CHAT_MEDIA_ROOT, restaurantId, file) : null;
}

/** Content-Type con el que se sirve un adjunto guardado */
export function chatMediaMime(file: string): string {
  return EXTENSION_MIME[file.split('.').pop() ?? ''] ?? 'application/octet-stream';
}

/** Lee un adjunto ya guardado (p. ej. la nota de voz de Baileys, para transcribirla) */
export async function readChatMedia(restaurantId: string, file: string): Promise<Buffer | null> {
  const filePath = chatMediaPath(restaurantId, file);
  if (!filePath || file === MENU_PDF_MEDIA) return null;
  return fs.readFile(filePath).catch(() => null);
}

/** Texto del mensaje en el historial (la IA y la bandeja lo leen; el adjunto va aparte) */
export function describeChatMedia(kind: ChatMediaKind | 'unsupported', caption?: string | null, name?: string | null): string {
  const label =
    kind === 'image'
      ? '📷 Imagen'
      : kind === 'audio'
        ? '🎙️ Nota de voz'
        : kind === 'document'
          ? `📄 Documento${name ? `: ${name}` : ''}`
          : '📎 Archivo adjunto (formato no soportado)';
  return caption?.trim() ? `${label}\n${caption.trim()}` : label;
}
