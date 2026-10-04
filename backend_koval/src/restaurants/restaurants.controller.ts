import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UseGuards, Controller, Get, Post, Body, Patch, Param, Delete , UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RestaurantsService } from './restaurants.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';

@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) { }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createRestaurantDto: CreateRestaurantDto) {
    return this.restaurantsService.create(createRestaurantDto);
  }

  @Get()
  findAll() {
    return this.restaurantsService.findAll();
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.restaurantsService.findBySlug(slug);
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.restaurantsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRestaurantDto: UpdateRestaurantDto) {
    return this.restaurantsService.update(id, updateRestaurantDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.restaurantsService.remove(id);
  }

  @UseGuards(JwtAuthGuard)
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
