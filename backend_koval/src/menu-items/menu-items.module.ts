import { Module } from '@nestjs/common';
import { MenuItemsService } from './menu-items.service';
import { MenuItemsController } from './menu-items.controller';
import { RestaurantMenuItemsController } from './restaurant-menu-items.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [MenuItemsController, RestaurantMenuItemsController],
  providers: [MenuItemsService],
})
export class MenuItemsModule {}
