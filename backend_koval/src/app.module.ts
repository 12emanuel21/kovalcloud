import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { CategoriesModule } from './categories/categories.module';
import { MenuItemsModule } from './menu-items/menu-items.module';
import { OrdersModule } from './orders/orders.module';
import { MetaWhatsAppModule } from './meta-whatsapp/meta-whatsapp.module';
import { AiModule } from './ai/ai.module';
import { WhatsappGatewayModule } from './whatsapp-gateway/whatsapp-gateway.module';
import { AdminModule } from './admin/admin.module';
import { UsersModule } from './users/users.module';
import { ChatsModule } from './chats/chats.module';
import { DriversModule } from './drivers/drivers.module';
import { SupportModule } from './support/support.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [
    // Límite de peticiones por IP. Solo se aplica donde se use ThrottlerGuard (POST /orders).
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: Number(process.env.ORDERS_RATE_LIMIT) || 5,
        },
      ],
      errorMessage: 'Demasiados pedidos desde esta conexión. Intenta de nuevo en un minuto.',
    }),
    PrismaModule,
    AuthModule,
    RestaurantsModule,
    CategoriesModule,
    MenuItemsModule,
    OrdersModule,
    MetaWhatsAppModule,
    AiModule,
    WhatsappGatewayModule,
    AdminModule,
    UsersModule,
    ChatsModule,
    DriversModule,
    SupportModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
