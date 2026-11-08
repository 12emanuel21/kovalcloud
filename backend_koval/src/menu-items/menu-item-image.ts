import { BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Carpeta física de las fotos públicas de la carta: platos y portada del restaurante
 * (volumen backend_uploads -> /app/uploads)
 */
export const MENU_IMAGES_DIR = path.join(process.cwd(), 'uploads', 'menu');
/** Ruta pública que sirve nginx (location /uploads/menu/) */
export const MENU_IMAGES_PUBLIC_PATH = '/uploads/menu/';
export const MAX_MENU_IMAGE_BYTES = 5 * 1024 * 1024;

export type MenuImageExtension = 'jpg' | 'png' | 'webp';

/**
 * Tipo real de la imagen según sus primeros bytes ("magic numbers").
 * No se confía en el mimetype ni en la extensión que envía el navegador.
 */
export function detectImageType(buffer: Buffer): MenuImageExtension | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Nombre del archivo local si la URL apunta a una foto subida aquí; null para URLs externas */
export function localImageFilename(imageUrl: string | null | undefined): string | null {
  if (!imageUrl?.startsWith(MENU_IMAGES_PUBLIC_PATH)) return null;
  const name = imageUrl.slice(MENU_IMAGES_PUBLIC_PATH.length);
  // Solo nombres generados por nosotros (uuid.ext): evita borrar fuera de la carpeta
  return /^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(name) ? name : null;
}

/** Archivo recibido por multer (memoryStorage) */
export type UploadedImageFile = { buffer: Buffer; size: number } | undefined;

/** Valida tamaño y tipo real de la imagen subida y devuelve su extensión; no escribe nada */
export function assertUploadedImage(file: UploadedImageFile): MenuImageExtension {
  if (!file?.buffer?.length) throw new BadRequestException('Adjunta una imagen en el campo "image"');
  if (file.size > MAX_MENU_IMAGE_BYTES) throw new BadRequestException('La imagen no puede superar 5 MB');
  const extension = detectImageType(file.buffer);
  if (!extension) throw new BadRequestException('Formato no válido: sube una imagen JPG, PNG o WebP');
  return extension;
}

/** Guarda la imagen como uploads/menu/<uuid>.<ext> y devuelve su ruta pública */
export async function writeMenuImage(buffer: Buffer, extension: MenuImageExtension): Promise<string> {
  const filename = `${randomUUID()}.${extension}`;
  await fs.mkdir(MENU_IMAGES_DIR, { recursive: true });
  await fs.writeFile(path.join(MENU_IMAGES_DIR, filename), buffer);
  return `${MENU_IMAGES_PUBLIC_PATH}${filename}`;
}

/** Borra una imagen subida aquí (las URLs externas no se tocan); un fallo solo se registra */
export async function deleteMenuImage(imageUrl: string | null | undefined, logger: Logger): Promise<void> {
  const filename = localImageFilename(imageUrl);
  if (!filename) return;
  await fs.unlink(path.join(MENU_IMAGES_DIR, filename)).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== 'ENOENT') logger.warn(`No se pudo borrar la imagen anterior ${filename}: ${err.message}`);
  });
}
