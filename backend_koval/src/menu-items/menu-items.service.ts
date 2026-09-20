import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MenuItemsService {
  constructor(private prisma: PrismaService) { }

  async create(createMenuItemDto: CreateMenuItemDto) {
    const { name, description, price, imageUrl, isAvailable, restaurantId, categoryId } = createMenuItemDto;

    const category = await this.prisma.menuCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Categoría no encontrada');

    return await this.prisma.menuItem.create({
      data: {
        name,
        description,
        price,
        imageUrl,
        isAvailable: isAvailable ?? true,
        restaurantId,
        categoryId,
      },
    });
  }

  async findAll(restaurantId?: string) {
    return await this.prisma.menuItem.findMany({
      where: restaurantId ? { restaurantId } : {},
      include: { category: true },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Plato no encontrado');
    return item;
  }

  async update(id: string, updateMenuItemDto: UpdateMenuItemDto) {
    return await this.prisma.menuItem.update({
      where: { id },
      data: updateMenuItemDto,
    });
  }

  async remove(id: string) {
    return await this.prisma.menuItem.delete({ where: { id } });
  }
}