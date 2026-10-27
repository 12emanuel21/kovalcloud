import { promises as fs } from 'fs';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Role } from '@prisma/client';
import { MenuItemsService } from './menu-items.service';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';

describe('Foto del plato por enlace (URL)', () => {
  const invalidFields = async (imageUrl: unknown) =>
    (await validate(plainToInstance(UpdateMenuItemDto, { imageUrl }))).map((e) => e.property);

  it('acepta http(s), vacío o null; rechaza otros esquemas y rutas sueltas', async () => {
    expect(await invalidFields('https://cdn.ejemplo.com/hamburguesa.jpg')).toEqual([]);
    expect(await invalidFields('http://ejemplo.com/foto.png')).toEqual([]);
    expect(await invalidFields('')).toEqual([]);
    expect(await invalidFields(null)).toEqual([]);
    expect(await invalidFields('javascript:alert(1)')).toEqual(['imageUrl']);
    expect(await invalidFields('data:image/png;base64,AAAA')).toEqual(['imageUrl']);
    expect(await invalidFields('/uploads/menu/otra.jpg')).toEqual(['imageUrl']);
  });

  const owner = { role: Role.OWNER, restaurantId: 'rest-1' };
  const build = (imageUrl: string | null) => {
    const item = { id: 'item-1', restaurantId: 'rest-1', categoryId: 'cat-1', imageUrl };
    const prisma: any = {
      menuItem: {
        findFirst: jest.fn().mockResolvedValue(item),
        update: jest.fn().mockImplementation(({ data }) => ({ ...item, ...data })),
      },
    };
    return { prisma, service: new MenuItemsService(prisma) };
  };
  const LOCAL = '/uploads/menu/0f8fad5b-d9cb-469f-a165-70867728950e.jpg';

  it('guarda el enlace tal cual (sin almacenamiento propio) y borra la foto subida que reemplaza', async () => {
    const unlink = jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);
    const { prisma, service } = build(LOCAL);
    await service.update('item-1', { imageUrl: ' https://cdn.ejemplo.com/h.jpg ' }, owner);
    expect(prisma.menuItem.update.mock.calls[0][0].data.imageUrl).toBe('https://cdn.ejemplo.com/h.jpg');
    expect(unlink).toHaveBeenCalledWith(expect.stringContaining('0f8fad5b-d9cb-469f-a165-70867728950e.jpg'));
    unlink.mockRestore();
  });

  it('"" quita la foto; editar otros campos no toca la imagen ni borra archivos', async () => {
    const unlink = jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);
    const cleared = build('https://cdn.ejemplo.com/h.jpg');
    await cleared.service.update('item-1', { imageUrl: '' }, owner);
    expect(cleared.prisma.menuItem.update.mock.calls[0][0].data.imageUrl).toBeNull();
    expect(unlink).not.toHaveBeenCalled(); // era externa: no hay archivo que borrar

    const untouched = build(LOCAL);
    await untouched.service.update('item-1', { name: 'Nuevo nombre' }, owner);
    expect(untouched.prisma.menuItem.update.mock.calls[0][0].data.imageUrl).toBeUndefined();
    expect(unlink).not.toHaveBeenCalled();
    unlink.mockRestore();
  });
});
