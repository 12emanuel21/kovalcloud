import { AdminService } from './admin.service';

describe('AdminService.findAllTickets', () => {
  it('devuelve todos los tickets con id, nombre y slug del restaurante, más recientes primero', async () => {
    const prisma: any = { supportTicket: { findMany: jest.fn().mockResolvedValue([]) } };
    await new AdminService(prisma).findAllTickets();
    expect(prisma.supportTicket.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      include: { restaurant: { select: { id: true, name: true, slug: true } } },
    });
  });
});
