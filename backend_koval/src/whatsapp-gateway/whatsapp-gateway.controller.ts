import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SudoGuard } from '../auth/guards/sudo.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { internalApiHeaders } from '../config/secrets';

/**
 * Puente autenticado entre el dashboard y el microservicio Baileys.
 * El navegador nunca habla con Baileys ni conoce INTERNAL_API_KEY.
 *
 * Cada restaurante tiene su propia sesión de WhatsApp Web (multi-tenant).
 * El OWNER controla la de su restaurante (QR, conectar, cerrar sesión, enviar);
 * el SUPERADMIN puede operar la de cualquiera indicando ?restaurantId=.
 */
@Controller('whatsapp-gateway')
@UseGuards(JwtAuthGuard)
export class WhatsappGatewayController {
  private readonly logger = new Logger(WhatsappGatewayController.name);

  /** Base del microservicio a partir de WHATSAPP_SERVICE_URL (".../send") */
  private get baseUrl(): string {
    const sendUrl = process.env.WHATSAPP_SERVICE_URL || 'http://koval_baileys:5000/send';
    return sendUrl.replace(/\/send\/?$/, '');
  }

  /**
   * Restaurante cuya sesión se opera: el del usuario, o el indicado por un SUPERADMIN.
   * Un usuario de restaurante no puede pedir la sesión de otro.
   */
  private resolveRestaurantId(user: AuthenticatedUser, requested?: string): string {
    if (user.role === Role.SUPERADMIN) {
      if (!requested) {
        throw new BadRequestException('Indica ?restaurantId= para operar la sesión de un restaurante');
      }
      return requested;
    }
    if (!user.restaurantId) {
      throw new ForbiddenException('El usuario no pertenece a ningún restaurante');
    }
    if (requested && requested !== user.restaurantId) {
      throw new ForbiddenException('No puedes acceder a la sesión de WhatsApp de otro restaurante');
    }
    return user.restaurantId;
  }

  private async callBaileys(restaurantId: string, path: string, method: 'GET' | 'POST', body?: unknown) {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/sessions/${encodeURIComponent(restaurantId)}${path}`, {
        method,
        headers: internalApiHeaders(),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error: any) {
      this.logger.error(`❌ Microservicio WhatsApp no disponible: ${error?.message || error}`);
      throw new BadGatewayException('El servicio de WhatsApp no está disponible');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new HttpException(data, response.status);
    }
    return data;
  }

  @Get('status')
  async status(@CurrentUser() user: AuthenticatedUser, @Query('restaurantId') restaurantId?: string) {
    const data = await this.callBaileys(this.resolveRestaurantId(user, restaurantId), '/status', 'GET');
    // El QR permite vincular la sesión: solo lo ven el dueño y el SUPERADMIN
    if (user.role !== Role.SUPERADMIN && user.role !== Role.OWNER) {
      return { ...data, qr: null };
    }
    return data;
  }

  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.OWNER)
  @Post('connect')
  connect(@CurrentUser() user: AuthenticatedUser, @Query('restaurantId') restaurantId?: string) {
    return this.callBaileys(this.resolveRestaurantId(user, restaurantId), '/connect', 'POST');
  }

  // Cerrar la sesión deja al local sin bot de WhatsApp: exige Sudo Mode
  @UseGuards(RolesGuard, SudoGuard)
  @Roles(Role.SUPERADMIN, Role.OWNER)
  @Post('logout')
  logout(@CurrentUser() user: AuthenticatedUser, @Query('restaurantId') restaurantId?: string) {
    return this.callBaileys(this.resolveRestaurantId(user, restaurantId), '/logout', 'POST');
  }

  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.OWNER)
  @Post('send')
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { phone?: string; message?: string; to?: string; text?: string },
    @Query('restaurantId') restaurantId?: string,
  ) {
    return this.callBaileys(this.resolveRestaurantId(user, restaurantId), '/send', 'POST', {
      to: body.to || body.phone,
      text: body.text || body.message,
    });
  }
}
