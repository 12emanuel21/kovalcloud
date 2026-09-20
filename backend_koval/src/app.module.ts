import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { CategoriesModule } from './categories/categories.module';
import { MenuItemsModule } from './menu-items/menu-items.module';
import { OrdersModule } from './orders/orders.module';
import { MetaWhatsAppModule } from './meta-whatsapp/meta-whatsapp.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    RestaurantsModule,
    CategoriesModule,
    MenuItemsModule,
    OrdersModule,
    MetaWhatsAppModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
