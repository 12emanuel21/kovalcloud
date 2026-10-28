import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { normalizeColombianPhone } from '../orders/phone';

const logger = new Logger('WhatsAppBotNumber');

/** Número para wa.me: solo dígitos con indicativo (10 a 15). null si no alcanza para un número real */
const WA_NUMBER_PATTERN = /^\d{10,15}$/;

/**
 * Número de la línea del bot a partir de lo que reporta WhatsApp: el JID de Baileys
 * ("573001234567:12@s.whatsapp.net" -> "573001234567") o el display_phone_number de Meta
 * ("+57 300 123 4567"). Ya viene con indicativo: no se le antepone 57.
 */
export function toBotNumber(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.split('@')[0].split(':')[0].replace(/\D/g, '');
  return WA_NUMBER_PATTERN.test(digits) ? digits : null;
}

/** Teléfono escrito por el dueño en Ajustes para wa.me/<número> (se asume Colombia si no trae indicativo) */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const digits = normalizeColombianPhone(phone);
  return WA_NUMBER_PATTERN.test(digits) ? digits : null;
}

/**
 * Número público de la carta (pedidos y "Chatear por WhatsApp"):
 * 1) la línea realmente conectada al bot (SIM de Baileys o número de Meta),
 * 2) si no hay sesión vinculada, el teléfono del local,
 * 3) null (la carta oculta el botón).
 */
export function publicWhatsAppNumber(restaurant: { whatsappBotNumber?: string | null; phone?: string | null }) {
  return toBotNumber(restaurant.whatsappBotNumber) ?? toWhatsAppNumber(restaurant.phone);
}

/**
 * Guarda el número de la línea conectada (null = sesión desvinculada). Solo escribe si cambió.
 * Nunca lanza: es una sincronización de apoyo y no debe tumbar el webhook ni el logout.
 */
export async function syncWhatsAppBotNumber(
  prisma: PrismaService,
  restaurantId: string,
  raw: string | null,
  current?: string | null,
): Promise<boolean> {
  const number = raw === null ? null : toBotNumber(raw);
  if (raw !== null && !number) return false;
  try {
    const stored =
      current !== undefined
        ? current
        : (await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { whatsappBotNumber: true } }))
            ?.whatsappBotNumber;
    if (stored === undefined || (stored ?? null) === number) return false;
    await prisma.restaurant.update({ where: { id: restaurantId }, data: { whatsappBotNumber: number } });
    logger.log(`[${restaurantId}] Línea del bot ${number ? `sincronizada: ${number}` : 'desvinculada'}`);
    return true;
  } catch (error: any) {
    logger.warn(`[${restaurantId}] No se pudo sincronizar el número del bot: ${error?.message || error}`);
    return false;
  }
}
