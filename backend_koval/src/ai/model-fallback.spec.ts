import { generateObject, generateText } from 'ai';
import { AiService } from './ai.service';
import {
  AllModelsUnavailableError,
  isOverloadError,
  resolveModelChain,
  resolveTimeoutMs,
  runWithModelFallback,
} from './model-fallback';

jest.mock('ai', () => ({ ...jest.requireActual('ai'), generateObject: jest.fn(), generateText: jest.fn() }));
// El "modelo" es solo su nombre: así se ve a cuál se llamó en cada intento
jest.mock('@ai-sdk/google', () => ({ google: (modelId: string) => ({ modelId }) }));

const generateObjectMock = generateObject as jest.Mock;
const generateTextMock = generateText as jest.Mock;

/** Error como el que lanza el SDK cuando Gemini está saturado */
const highDemand = () =>
  Object.assign(new Error('The model is overloaded due to high demand. Please try again later.'), {
    name: 'AI_APICallError',
    statusCode: 503,
  });

const silentLogger = { warn: jest.fn() };

describe('Cadena de modelos de Gemini', () => {
  it('orden por defecto y configurable por env (GEMINI_MODEL + GEMINI_FALLBACK_MODEL)', () => {
    expect(resolveModelChain({})).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']);
    expect(resolveModelChain({ GEMINI_MODEL: 'gemini-2.5-pro', GEMINI_FALLBACK_MODEL: ' gemini-2.0-flash , gemini-2.5-pro ' })).toEqual([
      'gemini-2.5-pro',
      'gemini-2.0-flash',
    ]);
    expect(resolveModelChain({ GEMINI_MODEL: '', GEMINI_FALLBACK_MODEL: '' })[0]).toBe('gemini-2.5-flash');
    expect(resolveTimeoutMs({})).toBe(10_000);
    expect(resolveTimeoutMs({ GEMINI_TIMEOUT_MS: '8000' })).toBe(8000);
    expect(resolveTimeoutMs({ GEMINI_TIMEOUT_MS: 'x' })).toBe(10_000);
  });

  it('reconoce saturación, cuota y tiempo agotado; no un JSON inválido ni una llave mala', () => {
    expect(isOverloadError(highDemand())).toBe(true);
    expect(isOverloadError({ statusCode: 429, message: 'Resource exhausted' })).toBe(true);
    expect(isOverloadError(new Error('This model is currently experiencing high demand'))).toBe(true);
    expect(isOverloadError(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }))).toBe(true);
    // RetryError del SDK: el motivo real va en lastError
    expect(isOverloadError({ name: 'AI_RetryError', message: 'Failed after 3 attempts', lastError: highDemand() })).toBe(true);
    expect(isOverloadError({ name: 'AI_NoObjectGeneratedError', message: 'No object generated: response did not match schema.' })).toBe(false);
    expect(isOverloadError({ statusCode: 401, message: 'API key not valid' })).toBe(false);
    expect(isOverloadError({ statusCode: 400, message: 'Invalid argument' })).toBe(false);
  });

  it('salta al respaldo en el acto si el principal está saturado (sin reintentar el mismo modelo)', async () => {
    const call = jest.fn().mockRejectedValueOnce(highDemand()).mockResolvedValueOnce('respuesta');
    await expect(runWithModelFallback(['principal', 'respaldo'], call, { timeoutMs: 1000, logger: silentLogger })).resolves.toBe('respuesta');
    expect(call.mock.calls.map(([model]) => model)).toEqual(['principal', 'respaldo']);
    expect(call.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
  });

  it('un modelo que no responde a tiempo se aborta y se usa el siguiente', async () => {
    const hang = (_model: string, signal: AbortSignal) =>
      new Promise<string>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    const call = jest.fn().mockImplementationOnce(hang).mockResolvedValueOnce('a tiempo');
    const started = Date.now();
    await expect(runWithModelFallback(['lento', 'rapido'], call, { timeoutMs: 50, logger: silentLogger })).resolves.toBe('a tiempo');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('un error que no es de saturación no prueba otros modelos; todos saturados -> AllModelsUnavailableError', async () => {
    const schemaError = Object.assign(new Error('No object generated'), { name: 'AI_NoObjectGeneratedError' });
    const call = jest.fn().mockRejectedValue(schemaError);
    await expect(runWithModelFallback(['a', 'b'], call, { timeoutMs: 1000 })).rejects.toBe(schemaError);
    expect(call).toHaveBeenCalledTimes(1);

    const busy = jest.fn().mockRejectedValue(highDemand());
    await expect(runWithModelFallback(['a', 'b'], busy, { timeoutMs: 1000, logger: silentLogger })).rejects.toBeInstanceOf(
      AllModelsUnavailableError,
    );
    expect(busy).toHaveBeenCalledTimes(2);
  });
});

describe('AiService con modelo de respaldo', () => {
  const env = { ...process.env };
  beforeEach(() => {
    generateObjectMock.mockReset();
    generateTextMock.mockReset();
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_FALLBACK_MODEL;
    delete process.env.GEMINI_TIMEOUT_MS;
  });
  afterAll(() => {
    process.env = env;
  });
  const intent = { intent: 'GREETING', items: [], responseToUser: '¡Hola!' };

  it('"high demand" en gemini-2.5-flash: responde gemini-2.5-flash-lite al primer intento, sin reintentos del SDK', async () => {
    generateObjectMock.mockRejectedValueOnce(highDemand()).mockResolvedValueOnce({ object: intent });
    const service = new AiService();

    await expect(service.parseOrderIntent('quiero un perro', 'menu', [], 'Betania')).resolves.toEqual(intent);

    const calls = generateObjectMock.mock.calls.map(([args]) => args);
    expect(calls.map((args) => args.model.modelId)).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
    // Cada intento: sin reintentos internos sobre el mismo modelo y con su límite de tiempo
    expect(calls.every((args) => args.maxRetries === 0 && args.abortSignal instanceof AbortSignal)).toBe(true);
  });

  it('respeta GEMINI_MODEL / GEMINI_FALLBACK_MODEL', async () => {
    process.env.GEMINI_MODEL = 'gemini-2.5-pro';
    process.env.GEMINI_FALLBACK_MODEL = 'gemini-2.0-flash';
    generateObjectMock.mockRejectedValueOnce(highDemand()).mockResolvedValueOnce({ object: intent });

    await new AiService().parseOrderIntent('hola', 'menu');

    expect(generateObjectMock.mock.calls.map(([args]) => args.model.modelId)).toEqual(['gemini-2.5-pro', 'gemini-2.0-flash']);
  });

  it('todos los modelos saturados: falla rápido (sin repetir la cadena) para que el bot responda con su respaldo', async () => {
    generateObjectMock.mockRejectedValue(highDemand());
    await expect(new AiService().parseOrderIntent('hola', 'menu')).rejects.toBeInstanceOf(AllModelsUnavailableError);
    expect(generateObjectMock).toHaveBeenCalledTimes(3);
  });

  it('un JSON fuera del esquema se sigue reintentando una vez', async () => {
    const schemaError = Object.assign(new Error('No object generated'), { name: 'AI_NoObjectGeneratedError' });
    generateObjectMock.mockRejectedValueOnce(schemaError).mockResolvedValueOnce({ object: intent });
    await expect(new AiService().parseOrderIntent('hola', 'menu')).resolves.toEqual(intent);
    expect(generateObjectMock.mock.calls.map(([args]) => args.model.modelId)).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash']);
  });

  it('la transcripción de notas de voz también usa el respaldo', async () => {
    generateTextMock.mockRejectedValueOnce(highDemand()).mockResolvedValueOnce({ text: ' quiero dos perros ' });
    await expect(new AiService().transcribeAudio(Buffer.from('x'), 'audio/ogg; codecs=opus')).resolves.toBe('quiero dos perros');
    expect(generateTextMock.mock.calls.map(([args]) => args.model.modelId)).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  });
});
