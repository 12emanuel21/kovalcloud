import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  HttpStatus,
  ForbiddenException,
  HttpCode,
  Logger,
  Header,
} from '@nestjs/common';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { MetaWebhookPayloadDto } from './dto/webhook-payload.dto';

@Controller('meta/webhook')
export class MetaWhatsAppController {
  private readonly logger = new Logger(MetaWhatsAppController.name);

  constructor(
    private readonly metaWhatsAppService: MetaWhatsAppService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Endpoint de Verificación del Webhook de Meta Cloud API
   * GET /meta/webhook/:verifyToken
   */
  @Get(':verifyToken')
  @Header('Content-Type', 'text/plain')
  async verifyWebhook(
    @Param('verifyToken') verifyToken: string,
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') hubVerifyToken?: string,
    @Query('hub.challenge') challenge?: string,
    @Query() allQuery?: Record<string, any>,
  ): Promise<string> {
    const activeMode = mode || allQuery?.['hub.mode'];
    const activeToken = hubVerifyToken || allQuery?.['hub.verify_token'];
    const activeChallenge = challenge || allQuery?.['hub.challenge'];
    const envVerifyToken = process.env.META_VERIFY_TOKEN;

    this.logger.log(
      `🔍 [Multi-Tenant] Solicitud de verificación de Webhook para token: "${verifyToken}" (mode: ${activeMode})`,
    );

    // 1. Consultar en PostgreSQL si existe un restaurante con este token o slug
    const restaurant = await this.prisma.restaurant.findFirst({
      where: {
        OR: [
          { whatsappVerifyToken: verifyToken },
          { slug: verifyToken },
          ...(envVerifyToken ? [{ whatsappVerifyToken: envVerifyToken }] : []),
        ],
      },
    });

    const isMatch =
      restaurant &&
      activeMode === 'subscribe' &&
      (!activeToken ||
        activeToken === verifyToken ||
        activeToken === restaurant.whatsappVerifyToken ||
        activeToken === restaurant.slug ||
        activeToken === envVerifyToken);

    if (isMatch) {
      this.logger.log(
        `✅ [Multi-Tenant] Webhook verificado exitosamente para restaurante "${restaurant.name}" (${restaurant.slug}).`,
      );
      return activeChallenge || 'OK';
    }

    this.logger.warn(
      `🚫 [Multi-Tenant] Verificación rechazada. verifyToken="${verifyToken}", activeToken="${activeToken}", mode="${activeMode}"`,
    );
    throw new ForbiddenException('Error de validación del token de verificación o restaurante no encontrado');
  }

  /**
   * Endpoint Receptor de Eventos y Mensajes de Meta Cloud API
   * POST /meta/webhook/:verifyToken
   */
  @UseGuards(JwtAuthGuard)
  @Post(':verifyToken')
  @HttpCode(HttpStatus.OK)
  handleIncomingWebhook(
    @Param('verifyToken') verifyToken: string,
    @Body() payload: MetaWebhookPayloadDto | any,
  ): { status: string } {
    // Procesar en segundo plano de manera asíncrona no bloqueante (< 200ms)
    this.metaWhatsAppService
      .processIncomingWebhook(payload, verifyToken)
      .catch((error) => {
        this.logger.error(
          `❌ Error no controlado procesando webhook en background: ${error?.message || error}`,
          error?.stack,
        );
      });

    // Respuesta inmediata requerida por Meta
    return { status: 'OK' };
  }
}