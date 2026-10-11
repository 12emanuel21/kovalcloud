import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaService } from '../prisma/prisma.service';
import { assertTenantAccess, TenantUser } from '../auth/tenant-access';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) { }

  async create(createCategoryDto: CreateCategoryDto, user: TenantUser) {
    const { name, order, restaurantId } = createCategoryDto;
    assertTenantAccess(user, restaurantId);

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

  /** Público (menú del cliente): exige filtrar por restaurantId o slug */
  async findAll(filter: { restaurantId?: string; slug?: string }) {
    if (!filter.restaurantId && !filter.slug) {
      throw new BadRequestException('Debes indicar restaurantId o slug');
    }
    return await this.prisma.menuCategory.findMany({
      where: {
        deletedAt: null,
        ...(filter.restaurantId && { restaurantId: filter.restaurantId }),
        ...(filter.slug && { restaurant: { slug: filter.slug } }),
      },
      include: { items: { where: { deletedAt: null } } },
      orderBy: { order: 'asc' },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.menuCategory.findFirst({
      where: { id, deletedAt: null },
      include: { items: { where: { deletedAt: null } } },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    return category;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto, user: TenantUser) {
    const category = await this.findOne(id);
    assertTenantAccess(user, category.restaurantId);

    if (updateCategoryDto.restaurantId && updateCategoryDto.restaurantId !== category.restaurantId) {
      throw new BadRequestException('No se puede mover una categoría a otro restaurante');
    }

    return await this.prisma.menuCategory.update({
      where: { id },
      data: {
        name: updateCategoryDto.name,
        order: updateCategoryDto.order,
      },
    });
  }

  /**
   * Borrado lógico: la categoría y sus platos se ocultan pero se conservan,
   * porque los pedidos históricos referencian esos platos (FK RESTRICT).
   */
  async remove(id: string, user: TenantUser) {
    const category = await this.findOne(id);
    assertTenantAccess(user, category.restaurantId);

    const deletedAt = new Date();
    return await this.prisma.$transaction(async (tx) => {
      await tx.menuItem.updateMany({
        where: { categoryId: id, deletedAt: null },
        data: { deletedAt, isAvailable: false },
      });
      return await tx.menuCategory.update({
        where: { id },
        data: { deletedAt },
      });
    });
  }
}
