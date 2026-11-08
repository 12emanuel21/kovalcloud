import { Prisma } from '@prisma/client';
import { CustomersService, PRIVACY_NOTICE, withPrivacyNotice } from './customers.service';

describe('CustomersService · termsAcceptedAt (Ley 1581)', () => {
  const build = (existing: Record<string, unknown> | null = null) => {
    const prisma: any = {
      customer: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'c1', ...data })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...existing, ...data })),
      },
    };
    return { prisma, service: new CustomersService(prisma) };
  };

  it('cliente nuevo que acepta: se crea con la fecha de autorización y sus datos', async () => {
    const { prisma, service } = build();
    await service.touch('rest-1', '573001112233', { name: ' Ana ', neighborhood: 'Riomar', acceptTerms: true });
    const data = prisma.customer.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ restaurantId: 'rest-1', phone: '573001112233', name: 'Ana', neighborhood: 'Riomar' });
    expect(data.termsAcceptedAt).toBeInstanceOf(Date);
    expect(data.lastActivityAt).toBeInstanceOf(Date);
  });

  it('sin aceptación no se marca; la fecha ya registrada nunca se pisa', async () => {
    const fresh = build();
    await fresh.service.touch('rest-1', '573001112233');
    expect(fresh.prisma.customer.create.mock.calls[0][0].data.termsAcceptedAt).toBeUndefined();

    const acceptedAt = new Date('2026-01-01');
    const known = build({ id: 'c1', termsAcceptedAt: acceptedAt });
    await known.service.touch('rest-1', '573001112233', { acceptTerms: true, address: '' });
    const data = known.prisma.customer.update.mock.calls[0][0].data;
    expect(data.termsAcceptedAt).toBeUndefined();
    expect(data.address).toBeUndefined(); // un dato vacío no borra el anterior
  });

  it('cliente existente sin autorización que acepta: se registra la fecha', async () => {
    const { prisma, service } = build({ id: 'c1', termsAcceptedAt: null });
    await service.touch('rest-1', '573001112233', { acceptTerms: true });
    expect(prisma.customer.update.mock.calls[0][0].data.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it('dos mensajes simultáneos de un cliente nuevo: el segundo actualiza en vez de fallar', async () => {
    const { prisma, service } = build();
    prisma.customer.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: '5.22.0' }),
    );
    prisma.customer.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'c1', termsAcceptedAt: null });
    await expect(service.touch('rest-1', '573001112233')).resolves.toBeTruthy();
    expect(prisma.customer.update.mock.calls[0][0].where).toEqual({ id: 'c1' });
  });

  it('safeTouch nunca rompe el flujo y el aviso va al pie del mensaje', async () => {
    const { prisma, service } = build();
    prisma.customer.findUnique.mockRejectedValueOnce(new Error('db caída'));
    await expect(service.safeTouch('rest-1', '5730')).resolves.toBeNull();
    expect(withPrivacyNotice('Hola')).toBe(`Hola\n\n${PRIVACY_NOTICE}`);
    expect(PRIVACY_NOTICE).toContain('Ley 1581');
  });
});
