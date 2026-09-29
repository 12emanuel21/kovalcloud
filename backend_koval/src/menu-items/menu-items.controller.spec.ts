import { PrismaService } from '../prisma/prisma.service';
import { Test, TestingModule } from '@nestjs/testing';
import { MenuItemsController } from './menu-items.controller';
import { MenuItemsService } from './menu-items.service';

describe('MenuItemsController', () => {
  let controller: MenuItemsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MenuItemsController],
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
MenuItemsService],
    }).compile();

    controller = module.get<MenuItemsController>(MenuItemsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
