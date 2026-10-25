import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { RestaurantsService } from './restaurants.service';
import { AiService } from '../ai/ai.service';
import { parseAvailable, parseImageUrl, parseMenuSpreadsheet, parsePrice } from './menu-spreadsheet';

/** Genera un .xlsx real en memoria a partir de filas */
const xlsxBuffer = (rows: unknown[][]): Buffer => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Menu');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

describe('menu-spreadsheet · celdas', () => {
  it.each([
    [18000, 18000],
    ['$ 9.500', 9500],
    ['COP 18,000', 18000],
    ['$1.250.000', 1250000],
    ['9.500,50', 9500.5],
    ['1,250.75', 1250.75],
    ['12.5', 12.5],
    ['abc', null],
    ['', null],
  ])('parsePrice(%p) = %p', (input, expected) => {
    expect(parsePrice(input)).toBe(expected);
  });

  it('Disponible: NO / FALSE / 0 apagan el plato; vacío o SI lo dejan disponible', () => {
    expect(['NO', 'no', 'False', '0', 0, false, 'Agotado'].map(parseAvailable)).toEqual(Array(7).fill(false));
    expect(['SI', 'sí', '', 'TRUE', 1, true].map(parseAvailable)).toEqual(Array(6).fill(true));
  });

  it('URL Imagen: solo enlaces http(s) válidos', () => {
    expect(parseImageUrl('https://cdn.ejemplo.com/pizza.jpg')).toBe('https://cdn.ejemplo.com/pizza.jpg');
    expect(parseImageUrl('ftp://x/y.jpg')).toBeNull();
    expect(parseImageUrl('pizza.jpg')).toBeNull();
  });
});

describe('menu-spreadsheet · archivo', () => {
  it('lee un XLSX con cabeceras en cualquier mayúscula/tilde y salta filas vacías', () => {
    const { rows, errors, warnings } = parseMenuSpreadsheet(
      xlsxBuffer([
        ['CATEGORIA', 'nombre', 'Descripción', 'precio', 'DISPONIBLE', 'url imagen'],
        ['Pizzas', 'Margarita', 'Tomate y albahaca', '$ 9.500', 'SI', 'https://img.test/m.jpg'],
        [],
        ['Bebidas', 'Limonada', '', 7000, 'NO', 'no-es-url'],
      ]),
      'menu.xlsx',
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { row: 2, category: 'Pizzas', name: 'Margarita', description: 'Tomate y albahaca', price: 9500, isAvailable: true, imageUrl: 'https://img.test/m.jpg' },
      { row: 4, category: 'Bebidas', name: 'Limonada', description: null, price: 7000, isAvailable: false, imageUrl: null },
    ]);
    expect(warnings).toEqual(['Fila 4: la URL de imagen no es un enlace http(s) válido y se ignoró']);
  });

  it('lee un CSV UTF-8 con BOM y acentos', () => {
    const csv = '﻿Categoría,Nombre,Precio\nPostres,Torta de maracuyá,"8.000"\n';
    const { rows, errors } = parseMenuSpreadsheet(Buffer.from(csv, 'utf8'), 'carta.csv');
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ category: 'Postres', name: 'Torta de maracuyá', price: 8000, isAvailable: true });
  });

  it('informa columnas obligatorias que faltan', () => {
    const { errors } = parseMenuSpreadsheet(xlsxBuffer([['Nombre', 'Precio'], ['A', 1]]), 'm.xlsx');
    expect(errors[0]).toContain('Faltan columnas obligatorias: Categoría');
  });

  it('reporta cada fila inválida con su número (fila 40) y no devuelve filas parciales para importar', () => {
    const data: unknown[][] = [['Categoría', 'Nombre', 'Precio']];
    for (let i = 2; i <= 50; i++) data.push(['Pizzas', `Plato ${i}`, i === 40 ? 'gratis' : 1000]);
    const { errors } = parseMenuSpreadsheet(xlsxBuffer(data), 'm.xlsx');
    expect(errors).toEqual(['Fila 40: el Precio "gratis" no es un número válido']);
  });
});

describe('RestaurantsService.importMenuFromSpreadsheet', () => {
  const build = () => {
    const tx: any = {
      menuCategory: {
        findMany: jest.fn().mockResolvedValue([{ id: 'cat-pizzas', name: 'Pizzas', order: 0 }]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `cat-${data.name.toLowerCase()}` })),
      },
      menuItem: { createMany: jest.fn().mockImplementation(({ data }) => Promise.resolve({ count: data.length })) },
    };
    const prisma: any = {
      restaurant: { findUnique: jest.fn().mockResolvedValue({ id: 'rest-1', users: [], plan: null }) },
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
    };
    return { tx, prisma, service: new RestaurantsService(prisma, {} as AiService, {} as any) };
  };

  it('reutiliza categorías existentes (sin importar tildes/mayúsculas), crea las nuevas una sola vez e inserta en una transacción', async () => {
    const { tx, prisma, service } = build();
    const file = xlsxBuffer([
      ['Categoría', 'Nombre', 'Precio', 'Disponible'],
      ['PIZZAS', 'Margarita', 9500, 'SI'],
      ['Bebidas', 'Limonada', 7000, 'NO'],
      ['bebidas', 'Gaseosa', 5000, ''],
    ]);

    const result = await service.importMenuFromSpreadsheet('rest-1', file, 'menu.xlsx');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.menuCategory.findMany).toHaveBeenCalledWith({
      where: { restaurantId: 'rest-1', deletedAt: null },
      select: { id: true, name: true, order: true },
    });
    expect(tx.menuCategory.create).toHaveBeenCalledTimes(1);
    expect(tx.menuCategory.create).toHaveBeenCalledWith({
      data: { name: 'Bebidas', order: 1, restaurantId: 'rest-1' },
      select: { id: true },
    });
    expect(tx.menuItem.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ name: 'Margarita', categoryId: 'cat-pizzas', isAvailable: true, restaurantId: 'rest-1' }),
      expect.objectContaining({ name: 'Limonada', categoryId: 'cat-bebidas', isAvailable: false }),
      expect.objectContaining({ name: 'Gaseosa', categoryId: 'cat-bebidas', isAvailable: true }),
    ]);
    expect(result).toMatchObject({ itemsCreated: 3, categoriesCreated: 1 });
  });

  it('con una fila inválida responde 400 y no abre la transacción (no se guarda nada)', async () => {
    const { prisma, service } = build();
    const file = xlsxBuffer([
      ['Categoría', 'Nombre', 'Precio'],
      ['Pizzas', 'Margarita', 9500],
      ['Pizzas', '', 'x'],
    ]);

    const error = await service.importMenuFromSpreadsheet('rest-1', file, 'menu.xlsx').catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse().message).toContain('Fila 3: el Nombre está vacío, el Precio "x" no es un número válido');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
