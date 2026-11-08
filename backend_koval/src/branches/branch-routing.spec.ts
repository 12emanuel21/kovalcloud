import { activeBranchesOf, resolveOrderBranchId } from './branch-routing';
import { quoteFor } from '../delivery-zones/delivery-coverage';

describe('Enrutamiento de pedidos por sede', () => {
  const branches = [
    { id: 'b-30', isMain: true },
    { id: 'b-60', isMain: false },
  ];
  const zones = [
    { id: 'z-norte', name: 'Norte', keywords: ['riomar'], fee: 6000, branchId: 'b-60' },
    { id: 'z-centro', name: 'Centro', keywords: ['prado'], fee: 5000, branchId: null },
  ];

  it('la cotización de una zona con sede incluye su branchId (y no lo agrega si la zona no tiene sede)', () => {
    expect(quoteFor(zones, null, 'Riomar')).toMatchObject({ zoneId: 'z-norte', branchId: 'b-60' });
    expect(quoteFor(zones, null, 'Prado')).not.toHaveProperty('branchId');
    expect(quoteFor(zones, 15000, 'Soledad')).not.toHaveProperty('branchId');
  });

  it('DELIVERY: la sede de la zona del barrio', () => {
    const quote = quoteFor(zones, 15000, 'Riomar');
    expect(resolveOrderBranchId({ orderType: 'DELIVERY', quote, branches })).toBe('b-60');
  });

  it('DELIVERY con tarifa estándar o zona sin sede: la sede principal', () => {
    expect(resolveOrderBranchId({ orderType: 'DELIVERY', quote: quoteFor(zones, 15000, 'Soledad'), branches })).toBe('b-30');
    expect(resolveOrderBranchId({ orderType: 'DELIVERY', quote: quoteFor(zones, null, 'Prado'), branches })).toBe('b-30');
    // Sin orderType el pedido es domicilio (default del modelo)
    expect(resolveOrderBranchId({ orderType: undefined, quote: null, branches })).toBe('b-30');
  });

  it('DELIVERY a una zona cuya sede está inactiva: la principal', () => {
    const quote = quoteFor(zones, null, 'Riomar');
    expect(resolveOrderBranchId({ orderType: 'DELIVERY', quote, branches: [{ id: 'b-30', isMain: true }] })).toBe('b-30');
  });

  it('TAKEAWAY / DINE_IN: la sede elegida; sin elegir o no válida, la principal', () => {
    expect(resolveOrderBranchId({ orderType: 'TAKEAWAY', quote: null, requestedBranchId: 'b-60', branches })).toBe('b-60');
    expect(resolveOrderBranchId({ orderType: 'TAKEAWAY', quote: null, branches })).toBe('b-30');
    expect(resolveOrderBranchId({ orderType: 'TAKEAWAY', quote: null, requestedBranchId: 'b-otra', branches })).toBe('b-30');
    expect(resolveOrderBranchId({ orderType: 'DINE_IN', quote: null, requestedBranchId: 'b-60', branches })).toBe('b-60');
  });

  it('DELIVERY ignora la sede que mande el cliente: manda la zona', () => {
    const quote = quoteFor(zones, null, 'Riomar');
    expect(resolveOrderBranchId({ orderType: 'DELIVERY', quote, requestedBranchId: 'b-30', branches })).toBe('b-60');
  });

  it('restaurante sin sedes: null (comportamiento de un solo local)', () => {
    expect(resolveOrderBranchId({ orderType: 'DELIVERY', quote: quoteFor(zones, null, 'Riomar'), branches: [] })).toBeNull();
    expect(resolveOrderBranchId({ orderType: 'TAKEAWAY', quote: null, requestedBranchId: 'b-60', branches: [] })).toBeNull();
  });

  it('si no se pueden cargar las sedes, el pedido sigue sin sede (nunca se pierde)', async () => {
    const prisma: any = { branch: { findMany: jest.fn().mockRejectedValue(new Error('db caída')) } };
    await expect(activeBranchesOf(prisma, 'rest-1')).resolves.toEqual([]);
    const ok: any = { branch: { findMany: jest.fn().mockResolvedValue(branches) } };
    await expect(activeBranchesOf(ok, 'rest-1')).resolves.toEqual(branches);
    expect(ok.branch.findMany.mock.calls[0][0].where).toEqual({ restaurantId: 'rest-1', isActive: true });
  });
});
