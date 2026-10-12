import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantParam } from '../auth/decorators/tenant-param.decorator';
import { UseGuards, Controller, Get, Post, Body, Patch, Param, Delete , UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { RestaurantsService } from './restaurants.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';

@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) { }

  // Solo el SUPERADMIN da de alta restaurantes
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN)
  @Post()
  create(@Body() createRestaurantDto: CreateRestaurantDto) {
    return this.restaurantsService.create(createRestaurantDto);
  }

  // Listado global de tenants (incluye correos de los dueños): solo SUPERADMIN
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN)
  @Get()
  findAll() {
    return this.restaurantsService.findAll();
  }

  // Público: menú digital para clientes
  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.restaurantsService.findBySlug(slug);
  }

  @UseGuards(JwtAuthGuard, TenantGuard)
  @TenantParam('id')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.restaurantsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, TenantGuard)
  @TenantParam('id')
  @Get(':id/whatsapp-config')
  findWhatsappConfig(@Param('id') id: string) {
    return this.restaurantsService.findWhatsappConfig(id);
  }

  @UseGuards(JwtAuthGuard, TenantGuard)
  @TenantParam('id')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRestaurantDto: UpdateRestaurantDto) {
    return this.restaurantsService.update(id, updateRestaurantDto);
  }

  @UseGuards(JwtAuthGuard, TenantGuard)
  @TenantParam('id')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.restaurantsService.remove(id);
  }

  @UseGuards(JwtAuthGuard, TenantGuard)
  @TenantParam('id')
  @Post(":id/menu/import")
  @UseInterceptors(FileInterceptor("file"))
  async importMenuFromPdf(
    @Param("id") id: string,
    @UploadedFile() file: { buffer: Buffer }
  ) {
    if (!file) throw new BadRequestException("Archivo PDF requerido");
    return this.restaurantsService.importMenuFromPdf(id, file.buffer);
  }
}
