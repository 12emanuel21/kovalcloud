import {
  BadGatewayException,
  Body,
  Controller,
  Get,
  HttpException,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { internalApiHeaders } from '../config/secrets';

/**
 * Puente autenticado entre el dashboard y el microservicio Baileys.
 * El navegador nunca habla con Baileys ni conoce INTERNAL_API_KEY.
 *
 * La sesión de Baileys es única para toda la instalación, así que las acciones
 * que la controlan (QR, conectar, cerrar sesión, enviar) son solo de SUPERADMIN.
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

  private async callBaileys(path: string, method: 'GET' | 'POST', body?: unknown) {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
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
  async status(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.callBaileys('/status', 'GET');
    // El QR permite vincular la sesión: solo lo ve el SUPERADMIN
    if (user.role !== Role.SUPERADMIN) {
      return { ...data, qr: null };
    }
    return data;
  }

  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN)
  @Post('connect')
  connect() {
    return this.callBaileys('/connect', 'POST');
  }

  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN)
  @Post('logout')
  logout() {
    return this.callBaileys('/logout', 'POST');
  }

  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN)
  @Post('send')
  send(@Body() body: { phone?: string; message?: string; to?: string; text?: string }) {
    return this.callBaileys('/send', 'POST', {
      to: body.to || body.phone,
      text: body.text || body.message,
    });
  }
}
