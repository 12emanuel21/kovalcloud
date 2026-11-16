/**
 * Cadena de modelos de Gemini con salto inmediato al respaldo.
 *
 * En un pico de demanda Gemini responde 503 ("high demand") o 429; el SDK, por defecto, reintenta el
 * mismo modelo con espera exponencial y el cliente de WhatsApp quedaba minutos sin respuesta. Aquí
 * cada modelo se llama una sola vez (maxRetries: 0) con un tiempo máximo, y ante saturación o
 * timeout se pasa al siguiente modelo de la lista en el acto.
 */

export const DEFAULT_PRIMARY_MODEL = 'gemini-2.5-flash';
export const DEFAULT_FALLBACK_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash'];

/** Tiempo máximo por intento en la conversación (WhatsApp): el cliente no debe esperar más */
export const DEFAULT_AI_TIMEOUT_MS = 10_000;

/** Lista separada por comas -> nombres de modelo limpios (vacío o ausente -> []) */
const parseList = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);

/**
 * Modelos en orden: GEMINI_MODEL (principal) y luego GEMINI_FALLBACK_MODEL (uno o varios separados
 * por coma). Sin variables: gemini-2.5-flash -> gemini-2.5-flash-lite -> gemini-2.0-flash.
 */
export function resolveModelChain(env: NodeJS.ProcessEnv = process.env): string[] {
  const primary = parseList(env.GEMINI_MODEL)[0] ?? DEFAULT_PRIMARY_MODEL;
  const fallbacks = parseList(env.GEMINI_FALLBACK_MODEL);
  return [...new Set([primary, ...(fallbacks.length ? fallbacks : DEFAULT_FALLBACK_MODELS)])];
}

/** GEMINI_TIMEOUT_MS (ms) o el valor por defecto */
export function resolveTimeoutMs(env: NodeJS.ProcessEnv = process.env, fallback = DEFAULT_AI_TIMEOUT_MS): number {
  const value = Number(env.GEMINI_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const OVERLOAD_STATUS = new Set([429, 500, 502, 503, 504]);
const OVERLOAD_TEXT = /high demand|overloaded|unavailable|resource[_ ]exhausted|rate limit|quota|try again later|timed? ?out|timeout|aborted/i;

/**
 * ¿El fallo es de capacidad del modelo (saturación, cuota o tiempo agotado)? Esos se resuelven con
 * otro modelo. Un JSON fuera del esquema, una llave inválida (401/403) o una petición mala (400) no.
 */
export function isOverloadError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 3) return false;
  const e = error as {
    name?: string;
    message?: string;
    statusCode?: number;
    status?: number;
    lastError?: unknown;
    cause?: unknown;
  };
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return true;
  const status = e.statusCode ?? e.status;
  if (typeof status === 'number') return OVERLOAD_STATUS.has(status);
  if (typeof e.message === 'string' && OVERLOAD_TEXT.test(e.message)) return true;
  // RetryError del SDK (lastError) o errores encadenados (cause)
  return isOverloadError(e.lastError, depth + 1) || isOverloadError(e.cause, depth + 1);
}

/** Error final cuando todos los modelos de la cadena estaban saturados */
export class AllModelsUnavailableError extends Error {
  constructor(
    readonly models: string[],
    readonly lastError: unknown,
  ) {
    super(`Ningún modelo de Gemini respondió a tiempo (${models.join(', ')})`);
    this.name = 'AllModelsUnavailableError';
  }
}

interface Logger {
  warn(message: string): void;
}

/**
 * Ejecuta `call` con cada modelo en orden hasta que uno responda. Cada intento lleva su propio
 * AbortSignal con el tiempo máximo. Un error que no es de saturación se propaga de inmediato
 * (otro modelo no lo arreglaría); si todos están saturados, AllModelsUnavailableError.
 */
export async function runWithModelFallback<T>(
  models: string[],
  call: (model: string, abortSignal: AbortSignal) => Promise<T>,
  options: { timeoutMs: number; logger?: Logger; label?: string },
): Promise<T> {
  let lastError: unknown;
  for (const [index, model] of models.entries()) {
    try {
      return await call(model, AbortSignal.timeout(options.timeoutMs));
    } catch (error) {
      if (!isOverloadError(error)) throw error;
      lastError = error;
      const next = models[index + 1];
      const reason = error instanceof Error ? error.message : String(error);
      options.logger?.warn(
        `⚡ ${options.label ?? 'Gemini'}: ${model} no disponible (${reason.slice(0, 120)})${next ? `; se usa ${next}` : ''}`,
      );
    }
  }
  throw new AllModelsUnavailableError(models, lastError);
}
