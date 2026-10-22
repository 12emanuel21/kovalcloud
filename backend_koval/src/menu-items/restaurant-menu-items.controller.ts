import { Controller, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantParam } from '../auth/decorators/tenant-param.decorator';
import { MenuItemsService } from './menu-items.service';
import { MAX_MENU_IMAGE_BYTES } from './menu-item-image';

/**
 * Rutas de platos anidadas en el restaurante (TenantGuard valida :id).
 * Solo el OWNER del local o el SUPERADMIN.
 */
@Controller('restaurants/:id/menu-items')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(Role.OWNER, Role.SUPERADMIN)
@TenantParam('id')
export class RestaurantMenuItemsController {
  constructor(private readonly menuItemsService: MenuItemsService) {}

  // multer corta en 5 MB (413) sin cargar archivos mayores en memoria; el tipo real se valida en el servicio
  @Post(':itemId/image')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_MENU_IMAGE_BYTES, files: 1 } }))
  uploadImage(
    @Param('id') restaurantId: string,
    @Param('itemId') itemId: string,
    @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
  ) {
    return this.menuItemsService.uploadImage(restaurantId, itemId, file);
  }
}
