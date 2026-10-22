import { BadRequestException, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { MenuItemsService } from './menu-items.service';
import { MENU_IMAGES_DIR, detectImageType, localImageFilename } from './menu-item-image';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(12)]);
const OLD_FILE = '0f8fad5b-d9cb-469f-a165-70867728950e.png';

describe('menu-item-image', () => {
  it('detecta JPEG, PNG y WebP por su contenido y rechaza lo demás', () => {
    expect(detectImageType(JPEG)).toBe('jpg');
    expect(detectImageType(PNG)).toBe('png');
    expect(detectImageType(WEBP)).toBe('webp');
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(detectImageType(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
  });

  it('solo reconoce como locales los nombres generados (uuid.ext) dentro de /uploads/menu/', () => {
    expect(localImageFilename(`/uploads/menu/${OLD_FILE}`)).toBe(OLD_FILE);
    expect(localImageFilename('/uploads/menu/../menus/r1.pdf')).toBeNull();
    expect(localImageFilename('https://cdn.test/a.jpg')).toBeNull();
    expect(localImageFilename(null)).toBeNull();
  });
});

describe('MenuItemsService.uploadImage', () => {
  let prisma: any;
  let service: MenuItemsService;

  beforeEach(() => {
    prisma = {
      menuItem: {
        findFirst: jest.fn().mockResolvedValue({ id: 'item-1', imageUrl: `/uploads/menu/${OLD_FILE}` }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'item-1', ...data })),
      },
    };
    service = new MenuItemsService(prisma);
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
    jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
    jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('guarda la foto con nombre uuid, actualiza imageUrl y borra la foto local anterior', async () => {
    const result = await service.uploadImage('rest-1', 'item-1', { buffer: PNG, size: PNG.length });

    expect(prisma.menuItem.findFirst).toHaveBeenCalledWith({
      where: { id: 'item-1', restaurantId: 'rest-1', deletedAt: null },
      select: { id: true, imageUrl: true },
    });
    const [writtenPath, writtenData] = (fs.writeFile as jest.Mock).mock.calls[0];
    expect(path.dirname(writtenPath)).toBe(MENU_IMAGES_DIR);
    expect(path.basename(writtenPath)).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(writtenData).toBe(PNG);
    expect(result.imageUrl).toBe(`/uploads/menu/${path.basename(writtenPath)}`);
    expect(fs.unlink).toHaveBeenCalledWith(path.join(MENU_IMAGES_DIR, OLD_FILE));
  });

  it('rechaza archivos que no son JPG/PNG/WebP aunque digan ser imagen, sin escribir nada', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    await expect(service.uploadImage('rest-1', 'item-1', { buffer: svg, size: svg.length })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('rechaza imágenes de más de 5 MB', async () => {
    await expect(service.uploadImage('rest-1', 'item-1', { buffer: JPEG, size: 5 * 1024 * 1024 + 1 })).rejects.toThrow(
      'La imagen no puede superar 5 MB',
    );
  });

  it('un plato de otro restaurante responde 404 y no se guarda el archivo', async () => {
    prisma.menuItem.findFirst.mockResolvedValue(null);
    await expect(service.uploadImage('rest-1', 'item-otro', { buffer: JPEG, size: JPEG.length })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(prisma.menuItem.update).not.toHaveBeenCalled();
  });
});
