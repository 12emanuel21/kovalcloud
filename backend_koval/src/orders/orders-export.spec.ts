import * as XLSX from 'xlsx';
import { BadRequestException } from '@nestjs/common';
import { buildOrdersWorkbook, exportFilename, resolveExportRange, type ExportOrder } from './orders-export';

const order = (fields: Partial<ExportOrder>): ExportOrder => ({
  id: 'f2796cc8-fa48-4954-b0cb-d7d2b1a46a3f',
  createdAt: new Date('2026-10-10T01:30:00Z'), // 9 oct 20:30 en Colombia
  customerName: 'Ana Pérez',
  customerPhone: '573001234567',
  orderType: 'DELIVERY',
  tableNumber: null,
  deliveryAddress: 'Calle 10 #5-20',
  status: 'DELIVERED',
  paymentMethod: 'CASH',
  paymentStatus: 'PENDING',
  paymentReference: null,
  total: 62000,
  items: [
    { quantity: 2, menuItem: { name: 'Clásica BQ' } },
    { quantity: 1, menuItem: { name: 'Doble Queso' } },
  ],
  ...fields,
});

describe('Reporte contable de pedidos (.xlsx)', () => {
  const range = resolveExportRange('2026-10-01', '2026-10-31');
  const orders = [
    order({}),
    order({
      id: 'aaaa1111-0000-0000-0000-000000000000',
      createdAt: new Date('2026-10-11T18:00:00Z'),
      orderType: 'DINE_IN',
      tableNumber: '4',
      paymentMethod: 'NEQUI',
      paymentStatus: 'PAID',
      paymentReference: 'KOV-AAAA1111-1',
      total: 30000,
    }),
    order({ id: 'bbbb2222-0000-0000-0000-000000000000', createdAt: new Date('2026-10-12T15:00:00Z'), status: 'CANCELLED', total: 18000 }),
    order({
      id: 'cccc3333-0000-0000-0000-000000000000',
      createdAt: new Date('2026-10-13T15:00:00Z'),
      status: 'PREPARING',
      paymentMethod: 'WOMPI',
      paymentReference: 'KOV-CCCC3333-1',
      total: 10000,
      items: [{ quantity: 1, menuItem: null }],
    }),
  ];
  const workbook = XLSX.read(buildOrdersWorkbook(orders, range, 'Burger BQ'), { type: 'buffer' });
  const sheetRows = (name: string) => XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, raw: true });

  it('hoja Pedidos: columnas contables, código corto, fecha real en hora de Colombia y total numérico', () => {
    const [header, first, second] = sheetRows('Pedidos') as unknown[][];
    expect(header).toEqual([
      'ID Pedido', 'Fecha y Hora', 'Cliente', 'Teléfono', 'Modalidad / Dirección', 'Detalle de Platos',
      'Método de Pago', 'Estado de Pago', 'Estado del Pedido', 'Total (COP)',
    ]);
    expect(first).toEqual([
      'F2796CC8', expect.any(Number), 'Ana Pérez', '573001234567', 'Domicilio: Calle 10 #5-20',
      '2x Clásica BQ; 1x Doble Queso', 'Efectivo', 'Cobrado (contra entrega)', 'Entregado', 62000,
    ]);
    const cell = workbook.Sheets.Pedidos.B2;
    expect(XLSX.SSF.format('yyyy-mm-dd hh:mm', cell.v)).toBe('2026-10-09 20:30');
    expect(second.slice(4, 9)).toEqual(['Mesa 4', '2x Clásica BQ; 1x Doble Queso', 'Wompi · Nequi', 'Pagado', 'Entregado']);
    const rows = sheetRows('Pedidos') as unknown[][];
    expect(rows[4].slice(5, 8)).toEqual(['1x Plato eliminado', 'Wompi', 'Pendiente']);
  });

  it('hoja Resumen: vendido sin cancelados, completados vs cancelados y desglose por medio de pago', () => {
    const rows = sheetRows('Resumen') as unknown[][];
    const find = (label: string) => rows.find((r) => r[0] === label);
    expect(find('Total vendido (sin cancelados)')).toEqual(['Total vendido (sin cancelados)', 3, 102000]);
    expect(find('Completados (entregados)')).toEqual(['Completados (entregados)', 2, 92000]);
    expect(find('Cancelados')).toEqual(['Cancelados', 1, 18000]);
    expect(find('Efectivo')).toEqual(['Efectivo', 1, 62000]);
    expect(find('Wompi · Nequi')).toEqual(['Wompi · Nequi', 1, 30000]);
    expect(find('Wompi')).toEqual(['Wompi', 1, 10000]);
    expect(find('Wompi confirmado (pagado en línea)')).toEqual(['Wompi confirmado (pagado en línea)', 1, 30000]);
  });

  it('nombres que empiezan por "=" se guardan como texto, nunca como fórmula', () => {
    const wb = XLSX.read(buildOrdersWorkbook([order({ customerName: '=HYPERLINK("http://x","clic")' })], range, 'X'), {
      type: 'buffer',
      cellFormula: true,
    });
    expect(wb.Sheets.Pedidos.C2).toMatchObject({ t: 's', v: '=HYPERLINK("http://x","clic")' });
    expect(wb.Sheets.Pedidos.C2.f).toBeUndefined();
  });

  it('rango: días completos en hora de Colombia, mes en curso por defecto y validación', () => {
    expect(range.start.toISOString()).toBe('2026-10-01T05:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(resolveExportRange(undefined, undefined, new Date('2026-10-27T03:00:00Z'))).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-26', // 26 oct 22:00 en Colombia
    });
    expect(() => resolveExportRange('2026-10-31', '2026-10-01')).toThrow(BadRequestException);
    expect(() => resolveExportRange('01/10/2026', '2026-10-31')).toThrow(BadRequestException);
    expect(() => resolveExportRange('2024-01-01', '2026-10-31')).toThrow(/366/);
    expect(exportFilename('burger-bq', range)).toBe('pedidos-burger-bq-2026-10-01_2026-10-31.xlsx');
  });
});
