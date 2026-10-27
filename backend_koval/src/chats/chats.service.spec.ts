import { BadRequestException } from '@nestjs/common';
import { ChatsService } from './chats.service';

describe('ChatsService', () => {
  let prisma: any;
  let service: ChatsService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      chatHistory: { groupBy: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new ChatsService(prisma, {} as any);
  });

  it('agrupa por teléfono con el último mensaje y ordena de más reciente a más antiguo', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([
        { customerPhone: '573001', message: 'hola', role: 'user', createdAt: new Date('2026-10-17T10:00:00Z') },
        { customerPhone: '573002', message: 'x'.repeat(300), role: 'model', createdAt: new Date('2026-10-17T12:00:00Z') },
      ])
      // Último marcador de handover por teléfono: 573001 lo pausó el equipo hace un momento
      .mockResolvedValueOnce([{ customerPhone: '573001', message: '[SYSTEM_BOT_PAUSED]', createdAt: new Date() }])
      .mockResolvedValueOnce([]);
    prisma.chatHistory.groupBy.mockResolvedValue([
      { customerPhone: '573001', _count: { _all: 4 } },
      { customerPhone: '573002', _count: { _all: 9 } },
    ]);

    const result = await service.listConversations('rest-1');

    expect(result.map((c) => c.customerPhone)).toEqual(['573002', '573001']);
    expect(result[0]).toMatchObject({ lastRole: 'model', messageCount: 9 });
    expect(result[0].lastMessage.length).toBeLessThanOrEqual(161); // snippet recortado + "…"
    expect(result[1]).toMatchObject({ lastMessage: 'hola', lastRole: 'user', messageCount: 4, botPaused: true });
    expect(result[0].botPaused).toBe(false);
    // El filtro por restaurante viaja como parámetro de la consulta (nunca concatenado)
    expect(prisma.$queryRaw.mock.calls[0]).toContain('rest-1');
    // Los marcadores "system" (reset, pausa) no cuentan como mensajes
    expect(prisma.chatHistory.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { restaurantId: 'rest-1', role: { not: 'system' } } }),
    );
  });

  it('el historial de un teléfono se filtra por restaurante y va en orden cronológico', async () => {
    await service.getConversation('rest-1', '573001234567');
    expect(prisma.chatHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { restaurantId: 'rest-1', customerPhone: '573001234567' },
        orderBy: { createdAt: 'asc' },
      }),
    );
  });

  it('rechaza teléfonos que no son solo dígitos', async () => {
    await expect(service.getConversation('rest-1', "57' OR 1=1")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.chatHistory.findMany).not.toHaveBeenCalled();
  });
});

describe('ChatsService · intervención humana', () => {
  const PHONE = '573001234567';
  const build = (opts: { meta?: boolean; sendResult?: unknown; paused?: boolean } = {}) => {
    const created: any[] = [];
    const prisma: any = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rest-1',
          whatsappPhoneId: opts.meta ? 'phone-id' : null,
          whatsappToken: opts.meta ? 'token' : null,
        }),
      },
      chatHistory: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.role === 'system') {
            const last = [...created].reverse().find((r) => r.role === 'system');
            if (last) return Promise.resolve({ message: last.message, createdAt: last.createdAt });
            return Promise.resolve(opts.paused ? { message: '[SYSTEM_BOT_PAUSED]', createdAt: new Date() } : null);
          }
          if (where.role === 'user') return Promise.resolve({ createdAt: new Date() });
          return Promise.resolve(null);
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const row = { id: `m${created.length}`, createdAt: new Date(), ...data };
          created.push(row);
          return Promise.resolve(row);
        }),
      },
    };
    const whatsapp = { sendTextMessage: jest.fn().mockResolvedValue(opts.sendResult ?? { success: true }) };
    return { prisma, whatsapp, created, service: new ChatsService(prisma, whatsapp as any) };
  };

  it('envía por la sesión Baileys del local, registra el mensaje como "agent" y pausa el bot', async () => {
    const { service, whatsapp, created } = build();
    const result = await service.sendManualMessage('rest-1', PHONE, '  Hola Ana, ya va en camino  ');
    expect(whatsapp.sendTextMessage).toHaveBeenCalledWith('rest-1', '', PHONE, 'Hola Ana, ya va en camino', true);
    expect(created.map((r) => [r.role, r.message])).toEqual([
      ['system', '[SYSTEM_BOT_PAUSED]'],
      ['agent', 'Hola Ana, ya va en camino'],
    ]);
    expect(result.status).toMatchObject({ botPaused: true, channel: 'BAILEYS' });
  });

  it('con credenciales de Meta usa la Cloud API; si WhatsApp rechaza, no registra nada', async () => {
    const { service, whatsapp, created } = build({ meta: true, sendResult: { error: { message: 'Re-engagement message' } } });
    await expect(service.sendManualMessage('rest-1', PHONE, 'Hola')).rejects.toThrow(/24 h/);
    expect(whatsapp.sendTextMessage).toHaveBeenCalledWith('phone-id', 'token', PHONE, 'Hola', false);
    expect(created).toEqual([]);
  });

  it('no duplica el marcador si ya estaba pausado, y reanudar deja el bot activo', async () => {
    const paused = build({ paused: true });
    await paused.service.sendManualMessage('rest-1', PHONE, 'Te escribo yo');
    expect(paused.created.map((r) => r.role)).toEqual(['agent']);

    const resumed = await paused.service.setBotPaused('rest-1', PHONE, false);
    expect(paused.created.at(-1)).toMatchObject({ role: 'system', message: '[SYSTEM_BOT_RESUMED]' });
    expect(resumed.botPaused).toBe(false);
  });

  it('rechaza mensajes vacíos y teléfonos inválidos sin enviar nada', async () => {
    const { service, whatsapp } = build();
    await expect(service.sendManualMessage('rest-1', PHONE, '   ')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.sendManualMessage('rest-1', '57-300', 'hola')).rejects.toBeInstanceOf(BadRequestException);
    expect(whatsapp.sendTextMessage).not.toHaveBeenCalled();
  });
});

describe('resolveHandover', () => {
  const { resolveHandover, HANDOVER_TTL_MS } = jest.requireActual('./handover');
  const now = new Date('2026-10-27T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it('pausa vigente hasta 12 h después de la última actividad humana; luego el bot vuelve solo', () => {
    expect(resolveHandover(null, null, now).botPaused).toBe(false);
    expect(resolveHandover({ message: '[SYSTEM_BOT_RESUMED]', createdAt: ago(1000) }, null, now).botPaused).toBe(false);
    expect(resolveHandover({ message: '[SYSTEM_BOT_PAUSED]', createdAt: ago(60_000) }, null, now).botPaused).toBe(true);
    // Pausado hace 13 h pero el equipo escribió hace 1 h: sigue pausado
    expect(resolveHandover({ message: '[SYSTEM_BOT_PAUSED]', createdAt: ago(13 * 3600_000) }, ago(3600_000), now)).toMatchObject({
      botPaused: true,
    });
    expect(resolveHandover({ message: '[SYSTEM_BOT_PAUSED]', createdAt: ago(HANDOVER_TTL_MS + 1) }, null, now).botPaused).toBe(false);
  });
});
