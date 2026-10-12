/** Campos de integración con Meta que nunca deben salir en respuestas genéricas */
const RESTAURANT_SECRET_FIELDS = [
  'whatsappToken',
  'whatsappPhoneId',
  'whatsappWabaId',
  'whatsappVerifyToken',
  'metaAppSecret',
] as const;

type RestaurantSecretField = (typeof RESTAURANT_SECRET_FIELDS)[number];

/** Elimina credenciales de WhatsApp/Meta antes de devolver un restaurante al cliente */
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
