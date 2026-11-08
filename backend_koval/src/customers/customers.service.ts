import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Aviso de tratamiento de datos (Ley 1581 de 2012) al pie de la primera respuesta del bot.
 * Si el cliente sigue escribiendo, queda la autorización (termsAcceptedAt).
 */
export const PRIVACY_NOTICE =
  '📋 _Al continuar este chat, autorizas el tratamiento de tus datos para gestionar y entregar tu pedido (Ley 1581)._';

export const withPrivacyNotice = (text: string) => `${text}\n\n${PRIVACY_NOTICE}`;

export interface CustomerData {
  name?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  /** El cliente autorizó el tratamiento de datos (checkbox de la carta o chat tras el aviso) */
  acceptTerms?: boolean;
}

const clean = (value: string | null | undefined) => value?.trim().slice(0, 300) || undefined;

/**
 * Clientes por restaurante (teléfono único en cada local). Se registran o actualizan con cada
 * pedido y cada mensaje de WhatsApp; la fecha de autorización se conserva (no se pisa).
 */
@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(private readonly prisma: PrismaService) {}

  findByPhone(restaurantId: string, phone: string) {
    return this.prisma.customer.findUnique({ where: { restaurantId_phone: { restaurantId, phone } } });
  }

  /** Crea o actualiza el cliente: datos nuevos, última actividad y, si aplica, la autorización */
  async touch(restaurantId: string, phone: string, data: CustomerData = {}) {
    const fields = {
      name: clean(data.name),
      address: clean(data.address),
      neighborhood: clean(data.neighborhood),
      lastActivityAt: new Date(),
    };
    const existing = await this.findByPhone(restaurantId, phone);
    const termsAcceptedAt = data.acceptTerms && !existing?.termsAcceptedAt ? new Date() : undefined;
    if (existing) {
      return this.prisma.customer.update({ where: { id: existing.id }, data: { ...fields, termsAcceptedAt } });
    }
    try {
      return await this.prisma.customer.create({ data: { restaurantId, phone, ...fields, termsAcceptedAt } });
    } catch (error) {
      // Dos mensajes simultáneos del mismo cliente nuevo: el otro ya lo creó
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.touch(restaurantId, phone, data);
      }
      throw error;
    }
  }

  /** touch() que nunca rompe el flujo que lo llama (pedido o mensaje): solo registra el error */
  async safeTouch(restaurantId: string, phone: string, data: CustomerData = {}) {
    try {
      return await this.touch(restaurantId, phone, data);
    } catch (error: any) {
      this.logger.error(`❌ No se pudo registrar el cliente ${phone}: ${error?.message || error}`);
      return null;
    }
  }
}
