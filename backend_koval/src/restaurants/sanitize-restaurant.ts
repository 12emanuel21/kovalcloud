/**
 * Credenciales que nunca deben salir en respuestas genéricas (Meta y Wompi).
 * wompiPublicKey no está: es pública por diseño (la usa el checkout).
 */
const RESTAURANT_SECRET_FIELDS = [
  'whatsappToken',
  'whatsappPhoneId',
  'whatsappWabaId',
  'whatsappVerifyToken',
  'metaAppSecret',
  'wompiPrivateKey',
  'wompiEventSecret',
  'wompiIntegritySecret',
] as const;

type RestaurantSecretField = (typeof RESTAURANT_SECRET_FIELDS)[number];

/** Elimina credenciales (WhatsApp/Meta y Wompi) antes de devolver un restaurante al cliente */
export function sanitizeRestaurant<T extends object>(restaurant: T): Omit<T, RestaurantSecretField> {
  const safeRestaurant = { ...restaurant };
  for (const field of RESTAURANT_SECRET_FIELDS) {
    delete (safeRestaurant as Record<string, unknown>)[field];
  }
  return safeRestaurant;
}

/** Muestra solo los últimos 4 caracteres de un secreto (ej. "••••a1b2") */
export function maskSecret(secret: string | null | undefined): string | null {
  if (!secret) return null;
  return `••••${secret.slice(-4)}`;
}

/** Datos internos del local que no salen en la carta pública (solo los usa el asistente) */
const RESTAURANT_INTERNAL_FIELDS = ['customInstructions'] as const;

type RestaurantInternalField = (typeof RESTAURANT_INTERNAL_FIELDS)[number];

/** Quita los datos internos antes de devolver el restaurante en un endpoint público */
export function stripInternalRestaurantFields<T extends object>(restaurant: T): Omit<T, RestaurantInternalField> {
  const publicRestaurant = { ...restaurant };
  for (const field of RESTAURANT_INTERNAL_FIELDS) {
    delete (publicRestaurant as Record<string, unknown>)[field];
  }
  return publicRestaurant;
}
