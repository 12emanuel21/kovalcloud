import { promises as fs } from 'fs';
import { MetaWhatsAppService, IMAGE_RECEIVED_REPLY } from './meta-whatsapp.service';
import { BOT_PAUSED_MARKER } from '../chats/handover';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const AUDIO_FILE = '0f8fad5b-d9cb-469f-a165-70867728950e.ogg';
const CUSTOMER = '573001112233';

const restaurant = {
  id: 'rest-1',
  name: 'Betania',
  slug: 'betania',
  isTemporarilyClosed: false,
  businessHours: null,
  extendedUntil: null,
  whatsappToken: 'TOKEN',
  whatsappPhoneId: 'PHONE',
  whatsappBotNumber: null,
  paymentDetails: null,
};

/** Webhook de Meta (o del puente de Baileys) con un solo mensaje */
const webhook = (message: Record<string, unknown>) => ({
  entry: [{ changes: [{ value: { metadata: { phone_number_id: 'PHONE' }, messages: [{ from: CUSTOMER, ...message }] } }] }],
});

describe('MetaWhatsAppService · adjuntos entrantes y comprobantes', () => {
  let prisma: any;
  let ai: any;
  let gateway: any;
  let service: MetaWhatsAppService;
  let sent: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      restaurant: { findFirst: jest.fn().mockResolvedValue(restaurant) },
      chatHistory: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}) },
      order: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve({ id: where.id, restaurantId: 'rest-1', createdAt: new Date(), items: [], ...data }),
        ),
        count: jest.fn().mockResolvedValue(2),
      },
      menuItem: { findMany: jest.fn().mockResolvedValue([]) },
      autoReply: { findMany: jest.fn().mockResolvedValue([]) },
    };
    ai = {
      transcribeAudio: jest.fn().mockResolvedValue('quiero una hamburguesa'),
      parseOrderIntent: jest.fn().mockResolvedValue({ intent: 'QUESTION', responseToUser: '¡Claro!', items: [], sendMenuPdf: false }),
    };
    gateway = { emitOrderUpdated: jest.fn(), emitNewOrder: jest.fn() };
    service = new MetaWhatsAppService(prisma, ai, gateway, { quoteForOrder: jest.fn().mockResolvedValue(null) } as any, { findByPhone: jest.fn().mockResolvedValue({ termsAcceptedAt: new Date() }), safeTouch: jest.fn() } as any);
    sent = jest.spyOn(service, 'sendTextMessage').mockResolvedValue({});
    jest.spyOn(service, 'downloadMedia').mockResolvedValue(JPEG);
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
    jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  const savedChats = () => prisma.chatHistory.create.mock.calls.map((c: any[]) => c[0].data);

  it('Meta: una foto tras un pedido sin pagar queda como comprobante, se avisa al Kanban y se acusa recibo sin IA', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'order-9' });
    await service.processIncomingWebhook(webhook({ type: 'image', image: { id: 'MEDIA-1', mime_type: 'image/jpeg' } }), '', false, ['rest-1']);

    expect(service.downloadMedia).toHaveBeenCalledWith('MEDIA-1', 'TOKEN');
    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ restaurantId: 'rest-1', customerPhone: CUSTOMER, paymentStatus: { not: 'PAID' } }),
      }),
    );
    const { data } = prisma.order.update.mock.calls[0][0];
    expect(data.paymentProofUrl).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(data.paymentProofAt).toBeInstanceOf(Date);
    expect(gateway.emitOrderUpdated).toHaveBeenCalledWith('rest-1', expect.objectContaining({ id: 'order-9', dailyNumber: 3 }));

    expect(sent).toHaveBeenCalledWith('PHONE', 'TOKEN', CUSTOMER, expect.stringContaining('¡Recibimos tu comprobante del pedido #03! Ya lo estamos validando 🙌'), false);
    expect(ai.parseOrderIntent).not.toHaveBeenCalled();
    expect(savedChats()[0]).toMatchObject({ role: 'user', message: '📷 Imagen', mediaType: 'image', mediaMime: 'image/jpeg' });
    expect(savedChats()[0].mediaUrl).toBe(data.paymentProofUrl);
  });

  it('una foto sin texto y sin pedido pendiente: se guarda en el Inbox y se responde sin IA', async () => {
    await service.processIncomingWebhook(webhook({ type: 'image', image: { id: 'MEDIA-2', mime_type: 'image/jpeg' } }), '', false, ['rest-1']);
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(sent).toHaveBeenCalledWith('PHONE', 'TOKEN', CUSTOMER, IMAGE_RECEIVED_REPLY, false);
    expect(ai.parseOrderIntent).not.toHaveBeenCalled();
    expect(savedChats()[0]).toMatchObject({ mediaType: 'image' });
  });

  it('Baileys: nota de voz ya subida (baileys:<archivo>) se transcribe y queda en el Inbox con su audio', async () => {
    jest.spyOn(fs, 'stat').mockResolvedValue({ isFile: () => true } as any);
    jest.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('OggS-audio') as any);
    await service.processIncomingWebhook(
      webhook({ type: 'audio', audio: { id: `baileys:${AUDIO_FILE}`, mime_type: 'audio/ogg; codecs=opus' } }),
      '',
      true,
      ['rest-1'],
    );
    expect(service.downloadMedia).not.toHaveBeenCalled();
    expect(ai.transcribeAudio).toHaveBeenCalledWith(Buffer.from('OggS-audio'), 'audio/ogg');
    expect(ai.parseOrderIntent).toHaveBeenCalledWith('quiero una hamburguesa', expect.any(String), [], 'Betania');
    expect(savedChats()[0]).toMatchObject({ role: 'user', message: 'quiero una hamburguesa', mediaType: 'audio', mediaUrl: AUDIO_FILE });
    // Las notas de voz nunca se toman como comprobante
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
  });

  it('Baileys: una referencia que no existe en la carpeta del restaurante no se usa', async () => {
    jest.spyOn(fs, 'stat').mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    await service.processIncomingWebhook(webhook({ type: 'image', image: { id: 'baileys:../../etc/passwd' } }), '', true, ['rest-1']);
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(savedChats()[0]).toMatchObject({ message: expect.stringContaining('no soportado') });
    expect(savedChats()[0].mediaUrl).toBeUndefined();
  });

  it('con el bot pausado (lo atiende un humano): el comprobante se adjunta y se registra, sin responder', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'order-9' });
    prisma.chatHistory.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(where.role === 'system' ? { message: BOT_PAUSED_MARKER, createdAt: new Date() } : null),
    );
    await service.processIncomingWebhook(webhook({ type: 'image', image: { id: 'MEDIA-3', mime_type: 'image/jpeg' } }), '', false, ['rest-1']);
    expect(prisma.order.update).toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
    expect(savedChats()).toHaveLength(1);
  });
});
