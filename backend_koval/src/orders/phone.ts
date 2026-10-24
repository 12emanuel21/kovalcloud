/**
 * Teléfono del cliente en formato internacional solo con dígitos (como lo espera WhatsApp:
 * <número>@s.whatsapp.net para Baileys, o el campo "to" de Meta).
 *
 * - Quita espacios, guiones, puntos, paréntesis y el "+" (y el prefijo internacional "00").
 * - Si ya empieza por 57 (Colombia), se deja igual: "+57 300 123 4567" -> "573001234567".
 * - Celular colombiano de 10 dígitos que empieza por 3: se antepone 57. "300 123-4567" -> "573001234567".
 * - Cualquier otro número (fijo, extranjero) se deja con sus dígitos, sin inventar indicativo.
 * - Sin dígitos: se devuelve el texto original recortado (la validación del DTO decide).
 */
export function normalizeColombianPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^00/, '');
  if (!digits) return phone.trim();
  if (digits.startsWith('57')) return digits;
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
  return digits;
}
