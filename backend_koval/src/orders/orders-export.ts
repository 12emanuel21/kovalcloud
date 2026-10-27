import * as XLSX from 'xlsx';
import { BadRequestException } from '@nestjs/common';
import type { OrderStatus, OrderType } from '@prisma/client';

/** Colombia no tiene horario de verano: UTC-5 todo el año */
const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** Un año como máximo por archivo */
const MAX_RANGE_DAYS = 366;

export interface ExportOrder {
  id: string;
  createdAt: Date;
  customerName: string;
  customerPhone: string;
  orderType: OrderType;
  tableNumber: string | null;
  deliveryAddress: string | null;
  status: OrderStatus;
  paymentMethod: string | null;
  paymentStatus: string;
  paymentReference: string | null;
  total: number;
  items: Array<{ quantity: number; menuItem: { name: string } | null }>;
}

export interface ExportRange {
  from: string; // YYYY-MM-DD (hora de Colombia)
  to: string;
  start: Date;
  end: Date; // exclusivo
}

const toBogotaDateString = (date: Date) => new Date(date.getTime() + BOGOTA_OFFSET_MS).toISOString().slice(0, 10);

/**
 * Rango de fechas del reporte en hora de Colombia ("2026-10-01".."2026-10-31", ambos incluidos).
 * Sin fechas: el mes en curso.
 */
export function resolveExportRange(from?: string, to?: string, now: Date = new Date()): ExportRange {
  const today = toBogotaDateString(now);
  const fromDate = from || `${today.slice(0, 8)}01`;
  const toDate = to || today;
  if (!DATE_PATTERN.test(fromDate) || !DATE_PATTERN.test(toDate)) {
    throw new BadRequestException('Las fechas deben tener el formato AAAA-MM-DD');
  }
  const start = new Date(`${fromDate}T00:00:00-05:00`);
  const end = new Date(new Date(`${toDate}T00:00:00-05:00`).getTime() + 24 * 60 * 60 * 1000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new BadRequestException('Fecha inválida');
  if (end <= start) throw new BadRequestException('La fecha inicial no puede ser posterior a la final');
  if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
    throw new BadRequestException(`El reporte admite como máximo ${MAX_RANGE_DAYS} días`);
  }
  return { from: fromDate, to: toDate, start, end };
}

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmado',
  PREPARING: 'En preparación',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};

/** Medios que confirma el webhook de Wompi (payment_method_type) */
const WOMPI_METHOD_LABELS: Record<string, string> = {
  CARD: 'Tarjeta',
  NEQUI: 'Nequi',
  PSE: 'PSE',
  BANCOLOMBIA_TRANSFER: 'Bancolombia',
  BANCOLOMBIA_QR: 'Bancolombia QR',
  BANCOLOMBIA_COLLECT: 'Bancolombia corresponsal',
  DAVIPLATA: 'Daviplata',
};

const isOnlineOrder = (order: ExportOrder) =>
  Boolean(order.paymentReference) || (order.paymentMethod !== null && order.paymentMethod !== 'CASH');

/** "Efectivo" o "Wompi · Nequi" (WOMPI a secas mientras el webhook no confirma el medio) */
export function paymentMethodLabel(order: ExportOrder): string {
  if (!isOnlineOrder(order)) return 'Efectivo';
  const method = order.paymentMethod && order.paymentMethod !== 'WOMPI' ? order.paymentMethod : null;
  return method ? `Wompi · ${WOMPI_METHOD_LABELS[method] ?? method}` : 'Wompi';
}

/** Efectivo: se da por cobrado al entregar. Wompi: el estado que confirmó el webhook */
export function paymentStatusLabel(order: ExportOrder): string {
  if (!isOnlineOrder(order)) {
    if (order.status === 'CANCELLED') return 'Anulado';
    return order.status === 'DELIVERED' ? 'Cobrado (contra entrega)' : 'Por cobrar';
  }
  return { PAID: 'Pagado', FAILED: 'Rechazado', CANCELLED: 'Anulado' }[order.paymentStatus] ?? 'Pendiente';
}

function modalityLabel(order: ExportOrder): string {
  if (order.orderType === 'DINE_IN') return `Mesa ${order.tableNumber || '?'}`;
  if (order.orderType === 'TAKEAWAY') return 'Para llevar';
  return order.deliveryAddress?.trim() ? `Domicilio: ${order.deliveryAddress.trim()}` : 'Domicilio';
}

/** Fecha como número de serie de Excel en hora de Colombia (celda de fecha real, ordenable) */
const excelDate = (date: Date) => (date.getTime() + BOGOTA_OFFSET_MS) / 86_400_000 + 25569;

const COP_FORMAT = '"$"#,##0';

/**
 * Libro .xlsx para contabilidad: hoja "Pedidos" (una fila por pedido) y hoja "Resumen"
 * (ventas sin cancelados, completados vs cancelados y desglose por medio de pago).
 */
export function buildOrdersWorkbook(orders: ExportOrder[], range: ExportRange, restaurantName: string): Buffer {
  const header = [
    'ID Pedido',
    'Fecha y Hora',
    'Cliente',
    'Teléfono',
    'Modalidad / Dirección',
    'Detalle de Platos',
    'Método de Pago',
    'Estado de Pago',
    'Estado del Pedido',
    'Total (COP)',
  ];
  const rows = [...orders]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((order) => [
      order.id.slice(0, 8).toUpperCase(),
      excelDate(order.createdAt),
      order.customerName,
      order.customerPhone,
      modalityLabel(order),
      order.items.map((item) => `${item.quantity}x ${item.menuItem?.name ?? 'Plato eliminado'}`).join('; '),
      paymentMethodLabel(order),
      paymentStatusLabel(order),
      ORDER_STATUS_LABELS[order.status] ?? order.status,
      order.total,
    ]);

  const ordersSheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  rows.forEach((_, i) => {
    const r = i + 1;
    ordersSheet[XLSX.utils.encode_cell({ r, c: 1 })].z = 'yyyy-mm-dd hh:mm';
    ordersSheet[XLSX.utils.encode_cell({ r, c: 9 })].z = COP_FORMAT;
  });
  ordersSheet['!cols'] = [10, 17, 24, 15, 32, 48, 18, 22, 16, 14].map((wch) => ({ wch }));
  ordersSheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }) };

  // ── Resumen ──
  const valid = orders.filter((o) => o.status !== 'CANCELLED');
  const sum = (list: ExportOrder[]) => list.reduce((acc, o) => acc + o.total, 0);
  const delivered = orders.filter((o) => o.status === 'DELIVERED');
  const cancelled = orders.filter((o) => o.status === 'CANCELLED');
  const inProgress = valid.filter((o) => o.status !== 'DELIVERED');

  const byMethod = new Map<string, ExportOrder[]>();
  for (const order of valid) {
    const label = paymentMethodLabel(order);
    byMethod.set(label, [...(byMethod.get(label) ?? []), order]);
  }
  const wompiPaid = valid.filter((o) => isOnlineOrder(o) && o.paymentStatus === 'PAID');

  const summary: Array<Array<string | number>> = [
    [`Reporte de pedidos · ${restaurantName}`],
    ['Periodo', `${range.from} a ${range.to} (hora de Colombia)`],
    ['Generado', new Date(Date.now() + BOGOTA_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ')],
    [],
    ['Concepto', 'Pedidos', 'Total (COP)'],
    ['Total vendido (sin cancelados)', valid.length, sum(valid)],
    ['Completados (entregados)', delivered.length, sum(delivered)],
    ['En curso (pendientes / en preparación)', inProgress.length, sum(inProgress)],
    ['Cancelados', cancelled.length, sum(cancelled)],
    ['Ticket promedio (sin cancelados)', '', valid.length ? Math.round(sum(valid) / valid.length) : 0],
    [],
    ['Desglose por medio de pago (sin cancelados)', 'Pedidos', 'Total (COP)'],
    ...[...byMethod.entries()]
      .sort((a, b) => sum(b[1]) - sum(a[1]))
      .map(([label, list]) => [label, list.length, sum(list)]),
    [],
    ['Wompi confirmado (pagado en línea)', wompiPaid.length, sum(wompiPaid)],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summary);
  summary.forEach((row, r) => {
    const cell = summarySheet[XLSX.utils.encode_cell({ r, c: 2 })];
    if (cell && typeof row[2] === 'number') cell.z = COP_FORMAT;
  });
  summarySheet['!cols'] = [{ wch: 44 }, { wch: 12 }, { wch: 16 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');
  XLSX.utils.book_append_sheet(workbook, ordersSheet, 'Pedidos');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** pedidos-burger-bq-2026-10-01_2026-10-31.xlsx */
export const exportFilename = (slug: string, range: ExportRange) =>
  `pedidos-${slug.replace(/[^a-z0-9-]/gi, '') || 'restaurante'}-${range.from}_${range.to}.xlsx`;
