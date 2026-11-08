import { activeSessionHistory, CHAT_SESSION_TTL_MS } from './chat-session';

describe('activeSessionHistory (sesión de 3 h por inactividad)', () => {
  const now = new Date('2026-11-08T20:00:00Z');
  const ago = (minutes: number) => ({ id: String(minutes), createdAt: new Date(now.getTime() - minutes * 60_000) });

  it('conversación activa: conserva todo el historial', () => {
    const history = [ago(50), ago(30), ago(5)];
    expect(activeSessionHistory(history, now)).toEqual(history);
  });

  it('último mensaje hace más de 3 h: sesión nueva, sin contexto', () => {
    expect(activeSessionHistory([ago(300), ago(200)], now)).toEqual([]);
  });

  it('corta en el último hueco de más de 3 h: un pedido abandonado de ayer no se mezcla con el de hoy', () => {
    const today = [ago(20), ago(2)];
    expect(activeSessionHistory([ago(1500), ago(1490), ...today], now)).toEqual(today);
  });

  it('justo en el límite de 3 h sigue siendo la misma sesión', () => {
    expect(CHAT_SESSION_TTL_MS).toBe(180 * 60_000);
    expect(activeSessionHistory([ago(180)], now)).toHaveLength(1);
    expect(activeSessionHistory([ago(181)], now)).toEqual([]);
    expect(activeSessionHistory([], now)).toEqual([]);
  });
});
