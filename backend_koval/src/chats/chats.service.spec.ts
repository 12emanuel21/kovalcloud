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
    service = new ChatsService(prisma);
  });

  it('agrupa por teléfono con el último mensaje y ordena de más reciente a más antiguo', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { customerPhone: '573001', message: 'hola', role: 'user', createdAt: new Date('2026-10-17T10:00:00Z') },
      { customerPhone: '573002', message: 'x'.repeat(300), role: 'model', createdAt: new Date('2026-10-17T12:00:00Z') },
    ]);
    prisma.chatHistory.groupBy.mockResolvedValue([
      { customerPhone: '573001', _count: { _all: 4 } },
      { customerPhone: '573002', _count: { _all: 9 } },
    ]);

    const result = await service.listConversations('rest-1');

    expect(result.map((c) => c.customerPhone)).toEqual(['573002', '573001']);
    expect(result[0]).toMatchObject({ lastRole: 'model', messageCount: 9 });
    expect(result[0].lastMessage.length).toBeLessThanOrEqual(161); // snippet recortado + "…"
    expect(result[1]).toMatchObject({ lastMessage: 'hola', lastRole: 'user', messageCount: 4 });
    // El filtro por restaurante viaja como parámetro de la consulta (nunca concatenado)
    expect(prisma.$queryRaw.mock.calls[0]).toContain('rest-1');
    expect(prisma.chatHistory.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { restaurantId: 'rest-1' } }));
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
