import { NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { ChatsService } from './chats.service';

describe('ChatsService.openMedia (GET /restaurants/:id/chats/media/:file)', () => {
  const service = new ChatsService({} as any, {} as any);
  afterEach(() => jest.restoreAllMocks());

  it('rechaza nombres fuera de la carpeta del restaurante o inexistentes con 404', async () => {
    await expect(service.openMedia('rest-1', '../rest-2/0f8fad5b-d9cb-469f-a165-70867728950e.jpg')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.openMedia('rest-1', 'index.html')).rejects.toBeInstanceOf(NotFoundException);
    jest.spyOn(fs, 'stat').mockRejectedValue(new Error('ENOENT'));
    await expect(service.openMedia('rest-1', '0f8fad5b-d9cb-469f-a165-70867728950e.jpg')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sirve el comprobante con su tipo real y la carta en PDF como Menu.pdf', async () => {
    jest.spyOn(fs, 'stat').mockResolvedValue({ isFile: () => true } as any);
    const image = await service.openMedia('rest-1', '0f8fad5b-d9cb-469f-a165-70867728950e.jpg');
    expect(image.mime).toBe('image/jpeg');
    image.stream.destroy();
    const menu = await service.openMedia('rest-1', 'menu.pdf');
    expect(menu).toMatchObject({ mime: 'application/pdf', downloadName: 'Menu.pdf' });
    menu.stream.destroy();
  });
});
