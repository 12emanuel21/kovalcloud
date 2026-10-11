import { PrismaService } from '../prisma/prisma.service';
import { Test, TestingModule } from '@nestjs/testing';
import { RestaurantsService } from './restaurants.service';
import { AiService } from '../ai/ai.service';

describe('RestaurantsService', () => {
  let service: RestaurantsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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
        RestaurantsService,
      ],
    }).compile();

    service = module.get<RestaurantsService>(RestaurantsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
