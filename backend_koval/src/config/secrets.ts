import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Lee una variable de entorno obligatoria. Si falta, el backend no arranca:
 * nunca se usan valores por defecto para secretos (los antiguos quedaron en git).
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno obligatoria ${name}`);
  }
  return value;
}

/** Cabeceras para llamar al microservicio interno de WhatsApp (Baileys) */
export function internalApiHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': requireEnv('INTERNAL_API_KEY'),
  };
}

/** Compara una clave recibida con INTERNAL_API_KEY en tiempo constante */
export function isValidInternalApiKey(received: string | undefined): boolean {
  if (!received) return false;
  const expected = Buffer.from(requireEnv('INTERNAL_API_KEY'));
  const actual = Buffer.from(received);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Verifica la firma de un webhook de Meta: x-hub-signature-256 = "sha256=" + HMAC-SHA256(appSecret, rawBody).
 * Debe calcularse sobre los bytes EXACTOS recibidos (no sobre el JSON re-serializado).
 * El appSecret es el de la app de Meta del restaurante (BYOA). Sin secreto, rechaza (fail-closed).
 */
export function isValidMetaSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret: string | null | undefined,
): boolean {
  if (!appSecret || !rawBody || !signatureHeader?.startsWith('sha256=')) return false;

  const expected = Buffer.from('sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex'));
  const received = Buffer.from(signatureHeader);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
