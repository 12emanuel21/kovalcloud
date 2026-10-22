import * as path from 'path';

/** Carpeta física de las fotos de platos (volumen backend_uploads -> /app/uploads) */
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
