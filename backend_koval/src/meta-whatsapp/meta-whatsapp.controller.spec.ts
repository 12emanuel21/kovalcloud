import { Test, TestingModule } from '@nestjs/testing';
import { MetaWhatsAppController } from './meta-whatsapp.controller';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';

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

  describe('handleIncomingWebhook (POST)', () => {
    it('should return status OK immediately and trigger processIncomingWebhook', () => {
      const payload = { object: 'whatsapp_business_account', entry: [] };
      const result = controller.handleIncomingWebhook('valid_token', payload);

      expect(result).toEqual({ status: 'OK' });
      expect(service.processIncomingWebhook).toHaveBeenCalledWith(payload, 'valid_token');
    });
  });
});