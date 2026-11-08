import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { promises as fs } from 'fs';
import * as path from 'path';
import { RestaurantsService } from './restaurants.service';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { MENU_IMAGES_DIR } from '../menu-items/menu-item-image';
import type { AiService } from '../ai/ai.service';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const OLD_FILE = '0f8fad5b-d9cb-469f-a165-70867728950e.jpg';
const sudo = { user: { id: 'owner-1', isTwoFactorEnabled: false } } as any;

describe('RestaurantsService · portada del hero (bannerUrl)', () => {
  let prisma: any;
  let service: RestaurantsService;

  beforeEach(() => {
    prisma = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({ bannerUrl: `/uploads/menu/${OLD_FILE}` }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'rest-1', users: [], plan: null, ...data })),
      },
    };
    service = new RestaurantsService(prisma, {} as AiService, { assertSudo: jest.fn() } as any);
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
    jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
    jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('subir: guarda la imagen con nombre uuid, asigna bannerUrl y borra la portada local anterior', async () => {
    const result = await service.uploadBanner('rest-1', { buffer: JPEG, size: JPEG.length });

    const [writtenPath] = (fs.writeFile as jest.Mock).mock.calls[0];
    expect(path.dirname(writtenPath)).toBe(MENU_IMAGES_DIR);
    expect(result.bannerUrl).toBe(`/uploads/menu/${path.basename(writtenPath)}`);
    expect(prisma.restaurant.update).toHaveBeenCalledWith({ where: { id: 'rest-1' }, data: { bannerUrl: result.bannerUrl } });
    expect(fs.unlink).toHaveBeenCalledWith(path.join(MENU_IMAGES_DIR, OLD_FILE));
  });

  it('subir: rechaza lo que no es JPG/PNG/WebP y no escribe nada', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    await expect(service.uploadBanner('rest-1', { buffer: svg, size: svg.length })).rejects.toBeInstanceOf(BadRequestException);
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(prisma.restaurant.update).not.toHaveBeenCalled();
  });

  it('subir: restaurante inexistente responde 404 sin escribir el archivo', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);
    await expect(service.uploadBanner('nope', { buffer: JPEG, size: JPEG.length })).rejects.toBeInstanceOf(NotFoundException);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('PATCH con una URL nueva la guarda y borra la foto local anterior; una portada externa no se toca', async () => {
    await service.update('rest-1', { bannerUrl: ' https://cdn.test/portada.jpg ' }, sudo);
    expect(prisma.restaurant.update.mock.calls[0][0].data.bannerUrl).toBe('https://cdn.test/portada.jpg');
    expect(fs.unlink).toHaveBeenCalledWith(path.join(MENU_IMAGES_DIR, OLD_FILE));

    (fs.unlink as jest.Mock).mockClear();
    prisma.restaurant.findUnique.mockResolvedValue({ bannerUrl: 'https://cdn.test/portada.jpg' });
    await service.update('rest-1', { bannerUrl: 'https://cdn.test/otra.jpg' }, sudo);
    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it('PATCH con "" quita la portada (null); sin bannerUrl no la toca', async () => {
    await service.update('rest-1', { bannerUrl: '' }, sudo);
    expect(prisma.restaurant.update.mock.calls[0][0].data.bannerUrl).toBeNull();

    await service.update('rest-1', { name: 'Otro nombre' }, sudo);
    expect(prisma.restaurant.update.mock.calls[1][0].data.bannerUrl).toBeUndefined();
  });

  it('DTO: acepta https, la ruta de una foto subida, null y ""; rechaza otros esquemas', async () => {
    const errors = async (bannerUrl: unknown) =>
      (await validate(plainToInstance(UpdateRestaurantDto, { bannerUrl }))).filter((e) => e.property === 'bannerUrl');
    for (const ok of ['https://images.unsplash.com/photo-1?w=1600', `/uploads/menu/${OLD_FILE}`, null, '']) {
      expect(await errors(ok)).toHaveLength(0);
    }
    for (const bad of ['javascript:alert(1)', 'data:image/svg+xml;base64,AAAA', '/uploads/menus/r1.pdf', 'ftp://x/y.jpg']) {
      expect(await errors(bad)).not.toHaveLength(0);
    }
  });
});
