import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { PrismaService } from '../prisma/prisma.service';
import { assertTenantAccess, TenantUser } from '../auth/tenant-access';

@Injectable()
export class MenuItemsService {
  constructor(private prisma: PrismaService) { }

  /** Verifica que la categoría exista y pertenezca al restaurante indicado */
  private async assertCategoryBelongsTo(categoryId: string, restaurantId: string) {
    const category = await this.prisma.menuCategory.findFirst({ where: { id: categoryId, deletedAt: null } });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    if (category.restaurantId !== restaurantId) {
      throw new BadRequestException('La categoría no pertenece a este restaurante');
    }
  }

  async create(createMenuItemDto: CreateMenuItemDto, user: TenantUser) {
    const { name, description, price, imageUrl, isAvailable, restaurantId, categoryId } = createMenuItemDto;
    assertTenantAccess(user, restaurantId);
    await this.assertCategoryBelongsTo(categoryId, restaurantId);

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

  /** Público (menú del cliente): exige filtrar por restaurantId o slug */
  async findAll(filter: { restaurantId?: string; slug?: string }) {
    if (!filter.restaurantId && !filter.slug) {
      throw new BadRequestException('Debes indicar restaurantId o slug');
    }
    return await this.prisma.menuItem.findMany({
      where: {
        deletedAt: null,
        ...(filter.restaurantId && { restaurantId: filter.restaurantId }),
        ...(filter.slug && { restaurant: { slug: filter.slug } }),
      },
      include: { category: true },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.menuItem.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new NotFoundException('Plato no encontrado');
    return item;
  }

  async update(id: string, updateMenuItemDto: UpdateMenuItemDto, user: TenantUser) {
    const item = await this.findOne(id);
    assertTenantAccess(user, item.restaurantId);

    const { restaurantId, ...data } = updateMenuItemDto;
    if (restaurantId && restaurantId !== item.restaurantId) {
      throw new BadRequestException('No se puede mover un plato a otro restaurante');
    }
    if (data.categoryId && data.categoryId !== item.categoryId) {
      await this.assertCategoryBelongsTo(data.categoryId, item.restaurantId);
    }

    return await this.prisma.menuItem.update({
      where: { id },
      data,
    });
  }

  /**
   * Borrado lógico: el plato se oculta pero se conserva, porque los pedidos
   * históricos lo referencian (FK RESTRICT) y el historial financiero debe seguir intacto.
   */
  async remove(id: string, user: TenantUser) {
    const item = await this.findOne(id);
    assertTenantAccess(user, item.restaurantId);
    return await this.prisma.menuItem.update({
      where: { id },
      data: { deletedAt: new Date(), isAvailable: false },
    });
  }
}
