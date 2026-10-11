import { Test, TestingModule } from '@nestjs/testing';
import { MetaWhatsAppController } from './meta-whatsapp.controller';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';

describe('MetaWhatsAppController', () => {
  let controller: MetaWhatsAppController;
  let service: MetaWhatsAppService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetaWhatsAppController],
      providers: [
        {
          provide: MetaWhatsAppService,
          useValue: {
            processIncomingWebhook: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            restaurant: {
              findFirst: jest.fn().mockImplementation(({ where }) => {
                const orList = where?.OR || [];
                const matches = orList.some(
                  (cond: any) =>
                    cond.whatsappVerifyToken === 'valid_token' || cond.slug === 'valid_slug',
                );
                if (matches) {
                  return Promise.resolve({
                    id: 'rest-1',
                    name: 'Pizzería Nápoles',
                    slug: 'valid_slug',
                    whatsappVerifyToken: 'valid_token',
                  });
                }
                return Promise.resolve(null);
              }),
            },
          },
        },
      ],
    }).compile();

    controller = module.get<MetaWhatsAppController>(MetaWhatsAppController);
    service = module.get<MetaWhatsAppService>(MetaWhatsAppService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('verifyWebhook (GET)', () => {
    it('should return challenge if mode is subscribe and restaurant token exists in DB', async () => {
      const challenge = 'challenge_test_12345';
      const result = await controller.verifyWebhook(
        'valid_token',
        'subscribe',
        'valid_token',
        challenge,
      );
      expect(result).toBe(challenge);
    });

    it('should throw ForbiddenException if token is not found in DB', async () => {
      await expect(
        controller.verifyWebhook(
          'unknown_token',
          'subscribe',
          'unknown_token',
          'challenge_test_12345',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if mode is not subscribe', async () => {
      await expect(
        controller.verifyWebhook(
          'valid_token',
          'unsubscribe',
          'valid_token',
          'challenge_test_12345',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('handleIncomingWebhook (POST) — BYOA: App Secret por restaurante', () => {
    const SECRET_A = 'secreto-app-restaurante-a';
    // Bytes tal como llegan de Meta (con espacios): la firma se calcula sobre ESTOS bytes
    const rawJson =
      '{"object": "whatsapp_business_account", "entry": [{"id": "waba-a", "changes": [{"value": {"metadata": {"phone_number_id": "phone-a"}, "messages": [{"from": "573000000000", "type": "text", "text": {"body": "hola"}}]}}]}]}';
    const payload = JSON.parse(rawJson);
    const req = (raw = rawJson) => ({ rawBody: Buffer.from(raw) }) as any;
    const sign = (raw: string, secret: string) =>
      'sha256=' + createHmac('sha256', secret).update(Buffer.from(raw)).digest('hex');
    const restaurantsFound = (list: Array<{ id: string; metaAppSecret: string | null }>) =>
      ((service as any).findWebhookRestaurants = jest.fn().mockResolvedValue(list));

    beforeEach(() => {
      process.env.INTERNAL_API_KEY = 'test-internal-key';
    });

    it('accepts a webhook signed with the secret of the restaurant it belongs to', async () => {
      restaurantsFound([{ id: 'rest-a', metaAppSecret: SECRET_A }]);
      const result = await controller.handleIncomingWebhook(
        'valid_token', payload, 'meta', undefined, sign(rawJson, SECRET_A), req(),
      );

      expect(result).toEqual({ status: 'OK' });
      // Solo puede procesarse para el restaurante verificado
      expect(service.processIncomingWebhook).toHaveBeenCalledWith(payload, 'valid_token', false, ['rest-a']);
    });

    it('rejects when the restaurant has no Meta App Secret configured (401)', async () => {
      restaurantsFound([{ id: 'rest-a', metaAppSecret: null }]);
      await expect(
        controller.handleIncomingWebhook('valid_token', payload, 'meta', undefined, sign(rawJson, SECRET_A), req()),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when the payload does not match any restaurant (401)', async () => {
      restaurantsFound([]);
      await expect(
        controller.handleIncomingWebhook('valid_token', payload, 'meta', undefined, sign(rawJson, SECRET_A), req()),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects missing, wrong-secret or tampered signatures (401)', async () => {
      restaurantsFound([{ id: 'rest-a', metaAppSecret: SECRET_A }]);
      const call = (signature: string | undefined, raw = rawJson) =>
        controller.handleIncomingWebhook('valid_token', payload, 'meta', undefined, signature, req(raw));

      await expect(call(undefined)).rejects.toThrow(UnauthorizedException);
      await expect(call(sign(rawJson, 'secreto-de-otra-app'))).rejects.toThrow(UnauthorizedException);
      await expect(call(sign(rawJson, SECRET_A), rawJson.replace('waba-a', 'waba-x'))).rejects.toThrow(
        UnauthorizedException,
      );
      expect(service.processIncomingWebhook).not.toHaveBeenCalled();
    });

    it('rejects a payload mixing restaurants with different secrets (cross-tenant injection)', async () => {
      // Un tenant firma con SU secreto un payload que también referencia a otro restaurante
      restaurantsFound([
        { id: 'rest-a', metaAppSecret: SECRET_A },
        { id: 'rest-b', metaAppSecret: 'secreto-app-restaurante-b' },
      ]);
      await expect(
        controller.handleIncomingWebhook('token-de-b', payload, 'meta', undefined, sign(rawJson, SECRET_A), req()),
      ).rejects.toThrow(UnauthorizedException);
      expect(service.processIncomingWebhook).not.toHaveBeenCalled();
    });

    it('acknowledges Meta status receipts (sent/delivered/read) with 200 without reaching the AI flow', async () => {
      restaurantsFound([{ id: 'rest-a', metaAppSecret: SECRET_A }]);
      const statusJson =
        '{"object": "whatsapp_business_account", "entry": [{"id": "waba-a", "changes": [{"value": {"metadata": {"phone_number_id": "phone-a"}, "statuses": [{"id": "wamid.x", "status": "read", "recipient_id": "573000000000"}]}, "field": "messages"}]}]}';
      const result = await controller.handleIncomingWebhook(
        'valid_token', JSON.parse(statusJson), 'meta', undefined, sign(statusJson, SECRET_A), req(statusJson),
      );

      expect(result).toEqual({ status: 'OK' });
      expect(service.processIncomingWebhook).not.toHaveBeenCalled();
    });

    it('accepts internal Baileys traffic only with the internal api key (no Meta signature)', async () => {
      await expect(
        controller.handleIncomingWebhook('valid_token', payload, 'baileys', 'wrong', undefined, req()),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        controller.handleIncomingWebhook('valid_token', payload, 'baileys', 'test-internal-key', undefined, req()),
      ).resolves.toEqual({ status: 'OK' });
      expect(service.processIncomingWebhook).toHaveBeenCalledWith(payload, 'valid_token', true, undefined);
    });
  });
});
