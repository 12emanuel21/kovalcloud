import { WAITER_SYSTEM_PROMPT, buildWaiterSystemPrompt } from './prompts/waiter.prompt';

/**
 * El bot no sugiere por iniciativa propia una bebida puntual del catálogo ("¿Te lo acompaño con una
 * Limonada Cerezada?"): si el pedido no trae bebida, hace una sola pregunta abierta.
 */
describe('Prompt del cajero · pregunta genérica de bebida', () => {
  const DRINK_QUESTION = '¿Deseas agregar alguna bebida para acompañar?';
  const MENU = ['- [item-1] Perro Trifásico: $20000', '- [item-2] Limonada Cerezada: $9000', '- [item-3] Jugo de Corozo: $8000'].join('\n');
  const prompt = buildWaiterSystemPrompt({ restaurantName: 'Betania', dayPart: 'tarde', menu: MENU });
  /** Las reglas, sin el inventario (que sí trae los productos del local) */
  const rules = prompt.slice(0, prompt.indexOf('## INVENTARIO'));

  it('las reglas no nombran ninguna bebida del catálogo ni ejemplos de bebidas puntuales', () => {
    expect(rules).not.toMatch(/limonada|cerezada|corozo|jugo/i);
    expect(WAITER_SYSTEM_PROMPT).not.toMatch(/limonada|cerezada|corozo|perro trif/i);
    // Ni la vieja regla de upselling con una bebida que "combine"
    expect(rules).not.toMatch(/upselling|sugiere UNA bebida|Te lo acompaño con una (?!\[)/i);
  });

  it('los productos del menú solo aparecen en el inventario', () => {
    expect(rules).not.toContain('Limonada Cerezada');
    expect(prompt.slice(prompt.indexOf('## INVENTARIO'))).toContain('Limonada Cerezada');
  });

  it('si el pedido no trae bebida, una sola pregunta abierta y breve; nunca una bebida por su nombre', () => {
    expect(rules).toContain(`haz UNA sola vez esta pregunta abierta y breve: "${DRINK_QUESTION}"`);
    expect(rules).toContain('NUNCA sugieras por iniciativa propia una bebida ni otro producto específico por su nombre');
    expect(rules).toContain('Si ya pidió una bebida, no la hagas.');
    // El ejemplo de estilo usa la pregunta abierta
    expect(rules).toContain(`Claro, un [plato que pidió]. ${DRINK_QUESTION}`);
  });

  it('no pregunta por bebidas si las instrucciones del local lo prohíben', () => {
    expect(rules).toContain('Si las instrucciones especiales del local piden no ofrecer bebidas, o no hay bebidas en el INVENTARIO, no hagas la pregunta.');
    const withRules = buildWaiterSystemPrompt({
      restaurantName: 'Betania',
      dayPart: 'tarde',
      menu: MENU,
      customInstructions: 'No ofrecer bebidas a domicilio.',
    });
    expect(withRules).toContain('<instrucciones_del_local>\nNo ofrecer bebidas a domicilio.\n</instrucciones_del_local>');
  });

  it('recomendar un producto puntual solo cuando el cliente pide una recomendación', () => {
    expect(rules).toContain('SOLO si el cliente te pide una recomendación, recomendar UN producto puntual por su nombre');
  });
});
