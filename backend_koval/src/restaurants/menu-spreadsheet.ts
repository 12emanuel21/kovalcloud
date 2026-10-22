import * as XLSX from 'xlsx';

/** Formatos aceptados por POST /restaurants/:id/menu/import (además del PDF con IA) */
export const SPREADSHEET_EXTENSIONS = ['.xlsx', '.xls', '.csv'] as const;

/** Límite de filas por archivo: una carta real cabe de sobra y evita abusos */
export const MAX_IMPORT_ROWS = 2000;
const MAX_REPORTED_ERRORS = 20;

export interface MenuImportRow {
  /** Fila en la hoja (la 1 es la cabecera), para mensajes de error */
  row: number;
  category: string;
  name: string;
  description: string | null;
  price: number;
  isAvailable: boolean;
  imageUrl: string | null;
}

export interface ParsedMenuSpreadsheet {
  rows: MenuImportRow[];
  errors: string[];
  warnings: string[];
}

type Column = 'category' | 'name' | 'description' | 'price' | 'available' | 'imageUrl';

/** Cabecera normalizada (minúsculas, sin tildes ni espacios extra) -> columna */
const HEADER_ALIASES: Record<string, Column> = {
  categoria: 'category',
  category: 'category',
  nombre: 'name',
  plato: 'name',
  producto: 'name',
  name: 'name',
  descripcion: 'description',
  description: 'description',
  precio: 'price',
  price: 'price',
  disponible: 'available',
  disponibilidad: 'available',
  available: 'available',
  'url imagen': 'imageUrl',
  'url de imagen': 'imageUrl',
  'url de la imagen': 'imageUrl',
  imagen: 'imageUrl',
  image: 'imageUrl',
  'image url': 'imageUrl',
};

const REQUIRED_COLUMNS: Array<[Column, string]> = [
  ['category', 'Categoría'],
  ['name', 'Nombre'],
  ['price', 'Precio'],
];

const UNAVAILABLE_VALUES = new Set(['no', 'false', '0', 'n', 'agotado', 'falso']);

export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();
}

const cellText = (value: unknown): string => (value === null || value === undefined ? '' : String(value).trim());

/**
 * Precio desde una celda: número tal cual, o texto con símbolos de moneda.
 * "$ 9.500" -> 9500 · "COP 18,000" -> 18000 · "9.500,50" -> 9500.5 · "12.5" -> 12.5
 * Un único separador seguido de exactamente 3 dígitos se toma como separador de miles (formato colombiano).
 */
export function parsePrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = cellText(value).replace(/[^\d.,-]/g, '');
  if (!text || !/\d/.test(text)) return null;

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  let normalized: string;
  if (lastDot !== -1 && lastComma !== -1) {
    // Ambos separadores: el último es el decimal
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    normalized = text.split(thousands).join('').replace(decimal, '.');
  } else {
    const sep = lastDot !== -1 ? '.' : lastComma !== -1 ? ',' : null;
    if (!sep) {
      normalized = text;
    } else {
      const parts = text.split(sep);
      const isThousands = parts.length > 2 || parts[parts.length - 1].length === 3;
      normalized = isThousands ? parts.join('') : parts.join('.');
    }
  }
  const price = Number(normalized);
  return Number.isFinite(price) ? price : null;
}

/** "NO", "FALSE", "0" (o "Agotado") = no disponible; vacío o cualquier otro valor = disponible */
export function parseAvailable(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return !UNAVAILABLE_VALUES.has(normalizeHeader(cellText(value)));
}

/** Solo enlaces http(s) bien formados; cualquier otra cosa se descarta */
export function parseImageUrl(value: unknown): string | null {
  const text = cellText(value);
  if (!/^https?:\/\//i.test(text)) return null;
  try {
    return new URL(text).toString();
  } catch {
    return null;
  }
}

/**
 * Lee la primera hoja del archivo (XLSX, XLS o CSV) y valida cada fila.
 * No toca la base de datos: si `errors` no está vacío, no se debe importar nada.
 */
export function parseMenuSpreadsheet(buffer: Buffer, filename: string): ParsedMenuSpreadsheet {
  const isCsv = filename.toLowerCase().endsWith('.csv');
  let workbook: XLSX.WorkBook;
  try {
    // CSV como texto UTF-8 (acentos correctos) y sin interpretar valores: SheetJS leería "8.000"
    // como 8 (formato inglés); parsePrice entiende el formato colombiano. Excel, como binario.
    workbook = isCsv
      ? XLSX.read(buffer.toString('utf8').replace(/^﻿/, ''), { type: 'string', raw: true })
      : XLSX.read(buffer, { type: 'buffer' });
  } catch {
    return { rows: [], errors: ['No se pudo leer el archivo: verifica que sea un Excel (.xlsx/.xls) o CSV válido'], warnings: [] };
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { rows: [], errors: ['El archivo no tiene hojas'], warnings: [] };

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: true, raw: true });
  // Las filas vacías se conservan para que el número de fila reportado coincida con Excel
  while (matrix.length > 1 && (matrix[matrix.length - 1] ?? []).every((cell) => cellText(cell) === '')) matrix.pop();
  if (matrix.length < 2) {
    return { rows: [], errors: ['El archivo está vacío: se esperaba una fila de cabecera y al menos un plato'], warnings: [] };
  }

  // Mapa columna -> índice según la cabecera
  const columnIndex = new Map<Column, number>();
  (matrix[0] ?? []).forEach((header, index) => {
    const column = HEADER_ALIASES[normalizeHeader(cellText(header))];
    if (column && !columnIndex.has(column)) columnIndex.set(column, index);
  });
  const missing = REQUIRED_COLUMNS.filter(([column]) => !columnIndex.has(column)).map(([, label]) => label);
  if (missing.length) {
    return {
      rows: [],
      errors: [
        `Faltan columnas obligatorias: ${missing.join(', ')}. Columnas esperadas: Categoría, Nombre, Descripción, Precio, Disponible, URL Imagen`,
      ],
      warnings: [],
    };
  }

  const dataRows = matrix.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return { rows: [], errors: [`El archivo supera el máximo de ${MAX_IMPORT_ROWS} platos por importación`], warnings: [] };
  }

  const get = (cells: unknown[], column: Column) => {
    const index = columnIndex.get(column);
    return index === undefined ? '' : cells[index];
  };

  const rows: MenuImportRow[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  dataRows.forEach((cells, i) => {
    const row = i + 2; // +1 por la cabecera, +1 porque Excel cuenta desde 1
    if (cells.every((cell) => cellText(cell) === '')) return;

    const category = cellText(get(cells, 'category'));
    const name = cellText(get(cells, 'name'));
    const rawPrice = get(cells, 'price');
    const price = parsePrice(rawPrice);
    const rowErrors: string[] = [];

    if (!category) rowErrors.push('la Categoría está vacía');
    else if (category.length > 100) rowErrors.push('la Categoría supera 100 caracteres');
    if (!name) rowErrors.push('el Nombre está vacío');
    else if (name.length > 150) rowErrors.push('el Nombre supera 150 caracteres');
    if (price === null) rowErrors.push(`el Precio "${cellText(rawPrice)}" no es un número válido`);
    else if (price < 0) rowErrors.push('el Precio no puede ser negativo');

    if (rowErrors.length) {
      errors.push(`Fila ${row}: ${rowErrors.join(', ')}`);
      return;
    }

    const rawImage = cellText(get(cells, 'imageUrl'));
    const imageUrl = parseImageUrl(rawImage);
    if (rawImage && !imageUrl) warnings.push(`Fila ${row}: la URL de imagen no es un enlace http(s) válido y se ignoró`);

    const description = cellText(get(cells, 'description'));
    rows.push({
      row,
      category,
      name,
      description: description ? description.slice(0, 1000) : null,
      price: price!,
      isAvailable: parseAvailable(get(cells, 'available')),
      imageUrl,
    });
  });

  if (!errors.length && !rows.length) errors.push('El archivo no contiene platos para importar');

  return {
    rows,
    errors: errors.length > MAX_REPORTED_ERRORS
      ? [...errors.slice(0, MAX_REPORTED_ERRORS), `…y ${errors.length - MAX_REPORTED_ERRORS} errores más`]
      : errors,
    warnings,
  };
}
