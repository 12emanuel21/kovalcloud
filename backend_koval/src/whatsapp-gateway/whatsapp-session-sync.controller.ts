import { Body, Controller, Headers, HttpCode, HttpStatus, Post, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isValidInternalApiKey } from '../config/secrets';
import { syncWhatsAppBotNumber } from '../restaurants/whatsapp-bot-number';
import { SessionNumberDto } from './dto/session-number.dto';

/**
 * Canal interno microservicio Baileys -> backend (no lo usa el navegador).
 * Al abrir la sesión, Baileys informa el número real de la SIM vinculada; al desvincularse, null.
 * Solo con la clave interna x-api-key.
 */
@Controller('internal/whatsapp')
export class WhatsappSessionSyncController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('session')
  @HttpCode(HttpStatus.OK)
  async syncSession(@Headers('x-api-key') apiKey: string | undefined, @Body() dto: SessionNumberDto) {
    if (!isValidInternalApiKey(apiKey)) throw new UnauthorizedException('Clave interna inválida');
    const updated = await syncWhatsAppBotNumber(this.prisma, dto.restaurantId, dto.phoneNumber ?? null);
    return { success: true, updated };
  }
}
