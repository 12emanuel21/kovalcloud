import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) { }

  async create(createCategoryDto: CreateCategoryDto) {
    const { name, order, restaurantId } = createCategoryDto;

    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');

    return await this.prisma.menuCategory.create({
      data: {
        name,
        order: order ?? 0,
        restaurantId,
      },
    });
  }

  async findAll(restaurantId?: string) {
    return await this.prisma.menuCategory.findMany({
      where: restaurantId ? { restaurantId } : {},
      include: { items: true },
      orderBy: { order: 'asc' },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    return category;
  }

  async remove(id: string) {
    return await this.prisma.menuCategory.delete({ where: { id } });
  }
}