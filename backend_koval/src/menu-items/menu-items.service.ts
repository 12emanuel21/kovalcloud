import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { PrismaService } from '../prisma/prisma.service';
import { assertTenantAccess, TenantUser } from '../auth/tenant-access';
import {
  MAX_MENU_IMAGE_BYTES,
  MENU_IMAGES_DIR,
  MENU_IMAGES_PUBLIC_PATH,
  detectImageType,
  localImageFilename,
} from './menu-item-image';

@Injectable()
export class MenuItemsService {
  private readonly logger = new Logger(MenuItemsService.name);

  constructor(private prisma: PrismaService) { }

  /**
   * Foto del plato: valida el tipo real (JPEG/PNG/WebP) y el tamaño, la guarda en
   * uploads/menu/<uuid>.<ext> y deja en imageUrl la ruta pública. Borra la foto local anterior.
   */
  async uploadImage(restaurantId: string, itemId: string, file: { buffer: Buffer; size: number } | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Adjunta una imagen en el campo "image"');
    if (file.size > MAX_MENU_IMAGE_BYTES) throw new BadRequestException('La imagen no puede superar 5 MB');
    const extension = detectImageType(file.buffer);
    if (!extension) throw new BadRequestException('Formato no válido: sube una imagen JPG, PNG o WebP');

    // El plato debe ser de este restaurante (TenantGuard ya validó el acceso a :id)
    const item = await this.prisma.menuItem.findFirst({
      where: { id: itemId, restaurantId, deletedAt: null },
      select: { id: true, imageUrl: true },
    });
    if (!item) throw new NotFoundException('Plato no encontrado');

    const filename = `${randomUUID()}.${extension}`;
    await fs.mkdir(MENU_IMAGES_DIR, { recursive: true });
    await fs.writeFile(path.join(MENU_IMAGES_DIR, filename), file.buffer);

    const updated = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: { imageUrl: `${MENU_IMAGES_PUBLIC_PATH}${filename}` },
    });

    const previous = localImageFilename(item.imageUrl);
    if (previous) {
      await fs.unlink(path.join(MENU_IMAGES_DIR, previous)).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT') this.logger.warn(`No se pudo borrar la foto anterior ${previous}: ${err.message}`);
      });
    }
    return updated;
  }

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
