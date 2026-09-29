import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UseGuards, Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { MenuItemsService } from './menu-items.service';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';

@Controller('menu-items')
export class MenuItemsController {
  constructor(private readonly menuItemsService: MenuItemsService) { }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createMenuItemDto: CreateMenuItemDto) {
    return this.menuItemsService.create(createMenuItemDto);
  }

  @Get()
  findAll(@Query('restaurantId') restaurantId?: string) {
    return this.menuItemsService.findAll(restaurantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.menuItemsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateMenuItemDto: UpdateMenuItemDto) {
    return this.menuItemsService.update(id, updateMenuItemDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.menuItemsService.remove(id);
  }
}