import { promises as fs } from 'fs';
import * as path from 'path';
import { CHAT_MEDIA_ROOT, chatMediaPath, classifyChatMedia, describeChatMedia, storeChatMedia } from './chat-media';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(20)]);
const FILE = '0f8fad5b-d9cb-469f-a165-70867728950e.jpg';

describe('chat-media', () => {
  afterEach(() => jest.restoreAllMocks());

  it('clasifica por contenido real: imagen y PDF por magic numbers, audio por mimetype', () => {
    expect(classifyChatMedia(JPEG, 'application/octet-stream')).toEqual({ kind: 'image', ext: 'jpg' });
    expect(classifyChatMedia(PDF, 'image/png')).toEqual({ kind: 'document', ext: 'pdf' });
    expect(classifyChatMedia(Buffer.from('OggS....'), 'audio/ogg; codecs=opus')).toEqual({ kind: 'audio', ext: 'ogg' });
    // Un HTML disfrazado de imagen o un ejecutable no se guardan
    expect(classifyChatMedia(Buffer.from('<html><script>x</script></html>'), 'image/jpeg')).toBeNull();
    expect(classifyChatMedia(Buffer.from('MZ\x90\x00'), 'application/x-msdownload')).toBeNull();
  });

  it('guarda en uploads/chat/<restaurantId>/<uuid>.<ext> y rechaza tipos no soportados sin escribir', async () => {
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
    const write = jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

    const stored = await storeChatMedia('rest-1', PDF, 'application/pdf', ' comprobante.pdf ');
    expect(stored).toMatchObject({ kind: 'document', mime: 'application/pdf', name: 'comprobante.pdf' });
    expect(stored!.file).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(path.dirname(write.mock.calls[0][0] as string)).toBe(path.join(CHAT_MEDIA_ROOT, 'rest-1'));

    write.mockClear();
    await expect(storeChatMedia('rest-1', Buffer.from('texto'), 'text/plain')).resolves.toBeNull();
    await expect(storeChatMedia('../otro', JPEG, 'image/jpeg')).resolves.toBeNull();
    expect(write).not.toHaveBeenCalled();
  });

  it('solo resuelve nombres generados dentro de la carpeta del restaurante (o su carta en PDF)', () => {
    expect(chatMediaPath('rest-1', FILE)).toBe(path.join(CHAT_MEDIA_ROOT, 'rest-1', FILE));
    expect(chatMediaPath('rest-1', 'menu.pdf')).toBe(path.join(process.cwd(), 'uploads', 'menus', 'rest-1.pdf'));
    expect(chatMediaPath('rest-1', '../rest-2/' + FILE)).toBeNull();
    expect(chatMediaPath('rest-1', 'evil.html')).toBeNull();
    expect(chatMediaPath('../rest-2', FILE)).toBeNull();
  });

  it('describe el adjunto para la IA y la bandeja', () => {
    expect(describeChatMedia('image', 'Ya pagué')).toBe('📷 Imagen\nYa pagué');
    expect(describeChatMedia('document', null, 'factura.pdf')).toBe('📄 Documento: factura.pdf');
    expect(describeChatMedia('unsupported')).toContain('no soportado');
  });
});
