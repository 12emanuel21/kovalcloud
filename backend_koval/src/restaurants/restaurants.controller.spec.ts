import { PrismaService } from '../prisma/prisma.service';
import { Test, TestingModule } from '@nestjs/testing';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { AiService } from '../ai/ai.service';
import { JwtService } from '@nestjs/jwt';

describe('RestaurantsController', () => {
  let controller: RestaurantsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RestaurantsController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            $transaction: jest.fn(),
          },
        },
        // La importación de menús (PDF) usa la IA; en estos tests no se invoca
        { provide: AiService, useValue: { extractMenuFromPdf: jest.fn() } },
        // SudoGuard (rutas sensibles) verifica el x-sudo-token con JwtService
        { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
        RestaurantsService,
      ],
    }).compile();

    controller = module.get<RestaurantsController>(RestaurantsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
