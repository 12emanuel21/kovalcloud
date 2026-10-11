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
  Headers,
  UnauthorizedException,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { MetaWebhookPayloadDto } from './dto/webhook-payload.dto';
import { isValidInternalApiKey, isValidMetaSignature } from '../config/secrets';

/** IDs que identifican al restaurante en un payload de Meta (solo para logs/diagnóstico) */
function describeWebhookIds(payload: any): { phoneIds: string[]; wabaIds: string[] } {
  const entries: any[] = Array.isArray(payload?.entry) ? payload.entry : [];
  const phoneIds = new Set<string>();
  const wabaIds = new Set<string>();
  for (const entry of entries) {
    if (typeof entry?.id === 'string') wabaIds.add(entry.id);
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const phoneId = change?.value?.metadata?.phone_number_id;
      if (typeof phoneId === 'string') phoneIds.add(phoneId);
    }
  }
  return { phoneIds: [...phoneIds], wabaIds: [...wabaIds] };
}

/** Distingue mensajes de clientes (value.messages) de acuses de estado de Meta (value.statuses) */
function describeWebhookEvents(payload: any): { hasMessages: boolean; statuses: string[] } {
  const entries: any[] = Array.isArray(payload?.entry) ? payload.entry : [];
  let hasMessages = false;
  const statuses: string[] = [];
  for (const entry of entries) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value;
      if (Array.isArray(value?.messages) && value.messages.length > 0) hasMessages = true;
      if (Array.isArray(value?.statuses)) {
        for (const s of value.statuses) statuses.push(String(s?.status ?? 'desconocido'));
      }
    }
  }
  return { hasMessages, statuses };
}

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
   * POST /meta/webhook
   * POST /meta/webhook/:verifyToken
   */
  @Post(['', ':verifyToken'])
  @HttpCode(HttpStatus.OK)
  async handleIncomingWebhook(
    @Param('verifyToken') verifyToken: string | undefined,
    @Body() payload: MetaWebhookPayloadDto | any,
    @Headers('x-source') source: string,
    @Headers('x-api-key') apiKey: string | undefined,
    @Headers('x-hub-signature-256') metaSignature: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ status: string }> {
    const isBaileys = source === 'baileys';
    const ids = describeWebhookIds(payload);
    this.logger.log(
      `📥 Webhook POST recibido de ${isBaileys ? 'Baileys' : 'Meta'} ` +
        `| ruta=/meta/webhook${verifyToken ? `/${verifyToken}` : ''} ` +
        `| phone_number_id=[${ids.phoneIds.join(', ') || '-'}] waba_id=[${ids.wabaIds.join(', ') || '-'}] ` +
        `| firma=${metaSignature ? 'presente' : 'AUSENTE'} | rawBody=${req.rawBody?.length ?? 0} bytes`,
    );
    let trustedRestaurantIds: string[] | undefined;

    if (isBaileys) {
      // "x-source: baileys" solo es creíble si viene con la clave interna:
      // el webhook es público (nginx /meta/) y cualquiera podría falsificar la cabecera.
      if (!isValidInternalApiKey(apiKey)) {
        this.logger.warn('⛔ Rechazado (401): x-source=baileys sin clave interna x-api-key válida');
        throw new UnauthorizedException('Clave interna inválida');
      }
    } else {
      // BYOA: cada restaurante tiene su propia app de Meta (y su App Secret).
      // 1) Identificar a qué restaurante(s) se refiere el payload (phone_number_id / WABA id).
      // 2) Verificar la firma con el secreto de CADA uno: todos deben coincidir.
      if (!req.rawBody?.length) {
        this.logger.warn('⛔ Rechazado (401): no se pudo leer el raw body (¿Content-Type distinto de application/json?)');
        throw new UnauthorizedException('Firma de webhook inválida');
      }

      const restaurants = await this.metaWhatsAppService.findWebhookRestaurants(payload);
      if (restaurants.length === 0) {
        this.logger.warn(
          `⛔ Rechazado (401): restaurante no encontrado. Ningún restaurante tiene whatsappPhoneId en ` +
            `[${ids.phoneIds.join(', ') || '-'}] ni whatsappWabaId en [${ids.wabaIds.join(', ') || '-'}]. ` +
            `Revisa Phone ID / WABA ID en Dashboard > WhatsApp API.`,
        );
        throw new UnauthorizedException('Firma de webhook inválida');
      }

      for (const r of restaurants) {
        if (!r.metaAppSecret) {
          this.logger.warn(
            `⛔ Rechazado (401): el restaurante "${r.name}" (${r.id}) no tiene Meta App Secret configurado ` +
              `(Dashboard > WhatsApp API > Meta App Secret).`,
          );
          throw new UnauthorizedException('Firma de webhook inválida');
        }
      }

      if (!metaSignature) {
        this.logger.warn('⛔ Rechazado (401): falta la cabecera x-hub-signature-256 (la petición no viene firmada por Meta)');
        throw new UnauthorizedException('Firma de webhook inválida');
      }

      const unverified = restaurants.filter(
        (r) => !isValidMetaSignature(req.rawBody, metaSignature, r.metaAppSecret),
      );
      if (unverified.length > 0) {
        this.logger.warn(
          `⛔ Rechazado (401): firma HMAC inválida para ${unverified.map((r) => `"${r.name}"`).join(', ')}. ` +
            `El Meta App Secret guardado no corresponde a la app que envía el webhook ` +
            `(firma recibida: ${metaSignature.slice(0, 15)}…).`,
        );
        throw new UnauthorizedException('Firma de webhook inválida');
      }

      trustedRestaurantIds = restaurants.map((r) => r.id);
      this.logger.log(`✅ Firma HMAC válida para ${restaurants.map((r) => `"${r.name}"`).join(', ')}`);
    }

    // Acuses de Meta (sent/delivered/read/failed): solo se registran. Nunca llegan a la IA ni al KDS;
    // únicamente un payload con value.messages dispara el flujo conversacional.
    const { hasMessages, statuses } = describeWebhookEvents(payload);
    if (!hasMessages) {
      if (statuses.length > 0) {
        this.logger.log('Estado actualizado: ' + statuses.join(', '));
      } else {
        this.logger.log('Webhook sin mensajes ni estados: ignorado');
      }
      return { status: 'OK' };
    }

    // Debug: log inmediato para confirmar que el POST llega al controlador
    console.log('\n📥 Webhook POST recibido en controlador NestJS:', JSON.stringify(payload, null, 2));

    // Procesar en segundo plano de manera asíncrona no bloqueante (<200ms)
    console.log('--- DEBUG SOURCE HEADER ---', source);
    console.log('--- DEBUG ISBAILEYS ---', isBaileys);
    this.metaWhatsAppService
      .processIncomingWebhook(payload, verifyToken || '', isBaileys, trustedRestaurantIds)
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
