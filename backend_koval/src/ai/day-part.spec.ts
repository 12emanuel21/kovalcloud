import { dayPartOf } from './ai.service';
import { WAITER_SYSTEM_PROMPT } from '../meta-whatsapp/prompts/waiter.prompt';

describe('Saludo del bot sin hora exacta', () => {
  it('franja del día en la hora del local (Bogotá, UTC-5)', () => {
    expect(dayPartOf(new Date('2026-11-03T13:30:00Z'), 'America/Bogota')).toBe('mañana'); // 8:30 a. m.
    expect(dayPartOf(new Date('2026-11-03T20:00:00Z'), 'America/Bogota')).toBe('tarde'); // 3:00 p. m.
    expect(dayPartOf(new Date('2026-11-04T02:41:00Z'), 'America/Bogota')).toBe('noche'); // 9:41 p. m.
    expect(dayPartOf(new Date('2026-11-04T08:00:00Z'), 'America/Bogota')).toBe('noche'); // 3:00 a. m.
  });

  it('el prompt ya no recibe la hora y prohíbe mencionarla', () => {
    expect(WAITER_SYSTEM_PROMPT).not.toContain('{CURRENT_TIME}');
    expect(WAITER_SYSTEM_PROMPT).toContain('{DAY_PART}');
    expect(WAITER_SYSTEM_PROMPT).toMatch(/NUNCA menciones la hora exacta/);
  });
});
