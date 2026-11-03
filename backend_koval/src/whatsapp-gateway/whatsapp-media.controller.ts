import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PrismaService } from '../prisma/prisma.service';
import { isValidInternalApiKey } from '../config/secrets';
import { BAILEYS_MEDIA_PREFIX, MAX_CHAT_MEDIA_BYTES, storeChatMedia } from '../chats/chat-media';

/**
 * Canal interno Baileys -> backend para adjuntos entrantes (fotos, comprobantes, PDFs, notas de voz).
 * Baileys sube el archivo aquí y luego reenvía el mensaje al webhook con la referencia devuelta, así
 * el webhook sigue siendo un JSON pequeño. Solo con la clave interna x-api-key.
 */
@Controller('internal/whatsapp')
export class WhatsappMediaController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('media')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_CHAT_MEDIA_BYTES, files: 1 } }))
  async uploadMedia(
    @Headers('x-api-key') apiKey: string | undefined,
    @Body('restaurantId') restaurantId: string | undefined,
    @Body('mimetype') mimetype: string | undefined,
    @Body('filename') filename: string | undefined,
    @UploadedFile() file: { buffer: Buffer; mimetype?: string } | undefined,
  ) {
    if (!isValidInternalApiKey(apiKey)) throw new UnauthorizedException('Clave interna inválida');
    if (!restaurantId || !file?.buffer?.length) throw new BadRequestException('Faltan restaurantId o el archivo');
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');

    const stored = await storeChatMedia(restaurant.id, file.buffer, mimetype || file.mimetype, filename);
    if (!stored) throw new BadRequestException('Formato no soportado: solo imágenes, PDF o notas de voz');
    return { id: `${BAILEYS_MEDIA_PREFIX}${stored.file}`, kind: stored.kind, mime: stored.mime };
  }
}
