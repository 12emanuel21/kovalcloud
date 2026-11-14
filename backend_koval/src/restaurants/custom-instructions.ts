/** Máximo de las instrucciones especiales del local (igual que la columna VARCHAR(800)) */
export const CUSTOM_INSTRUCTIONS_MAX_LENGTH = 800;

/**
 * Instrucciones especiales tal como se guardan: sin espacios sobrantes al inicio o al final, saltos
 * de línea uniformes y sin más de una línea en blanco seguida.
 * undefined = no se toca; null, "" o solo espacios = se borran (null).
 */
export function cleanCustomInstructions(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const cleaned = value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned || null;
}
