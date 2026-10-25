import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantParam } from '../auth/decorators/tenant-param.decorator';
import { SudoGuard } from '../auth/guards/sudo.guard';
import { UseGuards, Controller, Get, Post, Body, Patch, Param, Delete , UseInterceptors, UploadedFile, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { RestaurantsService } from './restaurants.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { UpdateRestaurantConfigDto } from './dto/update-restaurant-config.dto';
import { ExtendHoursDto } from './dto/extend-hours.dto';
import { SPREADSHEET_EXTENSIONS } from './menu-spreadsheet';

/** Tamaño máximo del archivo de importación (PDF o Excel) */
const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

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

  // Perfil del local (incluye llaves de Wompi): OWNER del local o SUPERADMIN, en Sudo Mode
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, SudoGuard)
  @Roles(Role.OWNER, Role.SUPERADMIN)
  @TenantParam('id')
  @Patch(':id/config')
  updateConfig(@Param('id') id: string, @Body() dto: UpdateRestaurantConfigDto) {
    return this.restaurantsService.updateConfig(id, dto);
  }

  // Configuración de Wompi (secretos enmascarados): solo el OWNER del local o el SUPERADMIN
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.OWNER, Role.SUPERADMIN)
  @TenantParam('id')
  @Get(':id/payments-config')
  findPaymentsConfig(@Param('id') id: string) {
    return this.restaurantsService.findPaymentsConfig(id);
  }

  // Prórroga de horario (botones rápidos del Kanban): solo el OWNER del local o el SUPERADMIN
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.OWNER, Role.SUPERADMIN)
  @TenantParam('id')
  @Post(':id/extend-hours')
  @HttpCode(HttpStatus.OK)
  extendHours(@Param('id') id: string, @Body() dto: ExtendHoursDto) {
    return this.restaurantsService.extendHours(id, dto.minutes);
  }

  // Identidad del local y credenciales de WhatsApp/Meta: OWNER del local o SUPERADMIN, en Sudo Mode
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, SudoGuard)
  @Roles(Role.OWNER, Role.SUPERADMIN)
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

  /**
   * Importación de menú, según el archivo recibido en `file`:
   * - PDF: digitalización con IA (comportamiento original del modal de importación).
   * - XLSX / XLS / CSV: carga masiva por columnas, todo o nada (ver importMenuFromSpreadsheet).
   * Solo el OWNER del local o el SUPERADMIN.
   */
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(Role.OWNER, Role.SUPERADMIN)
  @TenantParam('id')
  @Post(':id/menu/import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_BYTES } }))
  async importMenu(
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; originalname?: string; mimetype?: string },
  ) {
    if (!file) throw new BadRequestException('Adjunta un archivo en el campo "file" (PDF, Excel o CSV)');
    const filename = (file.originalname ?? '').toLowerCase();

    if (filename.endsWith('.pdf') || file.mimetype === 'application/pdf') {
      return this.restaurantsService.importMenuFromPdf(id, file.buffer);
    }
    if (SPREADSHEET_EXTENSIONS.some((ext) => filename.endsWith(ext))) {
      return this.restaurantsService.importMenuFromSpreadsheet(id, file.buffer, filename);
    }
    throw new BadRequestException('Formato no soportado: sube un PDF, un Excel (.xlsx/.xls) o un CSV');
  }
}
