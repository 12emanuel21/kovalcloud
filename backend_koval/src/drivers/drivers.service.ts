import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toWhatsAppNumber } from '../restaurants/whatsapp-bot-number';
import { CreateDriverDto, UpdateDriverDto } from './dto/driver.dto';

const driverSelect = { id: true, name: true, phone: true, vehicleInfo: true, isActive: true, createdAt: true } as const;

/** Celular del repartidor listo para wa.me (dígitos con indicativo; Colombia por defecto) */
export function normalizeDriverPhone(phone: string): string {
  const number = toWhatsAppNumber(phone);
  if (!number) throw new BadRequestException('El celular del repartidor no es válido (ej. 300 123 4567)');
  return number;
}

const cleanText = (value: string | null | undefined) => (value === undefined ? undefined : value?.trim() || null);

/**
 * Domiciliarios del restaurante. El acceso por restaurante lo valida TenantGuard en el controlador;
 * aquí cada operación filtra además por restaurantId (un id de otro local da 404).
 */
@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  list(restaurantId: string, activeOnly = false) {
    return this.prisma.deliveryDriver.findMany({
      where: { restaurantId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: driverSelect,
    });
  }

  create(restaurantId: string, dto: CreateDriverDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('El nombre del repartidor es obligatorio');
    return this.prisma.deliveryDriver.create({
      data: { restaurantId, name, phone: normalizeDriverPhone(dto.phone), vehicleInfo: cleanText(dto.vehicleInfo) ?? null },
      select: driverSelect,
    });
  }

  async update(restaurantId: string, driverId: string, dto: UpdateDriverDto) {
    await this.assertOwned(restaurantId, driverId);
    const name = dto.name === undefined ? undefined : dto.name.trim();
    if (name === '') throw new BadRequestException('El nombre del repartidor es obligatorio');
    return this.prisma.deliveryDriver.update({
      where: { id: driverId },
      data: {
        name,
        phone: dto.phone === undefined ? undefined : normalizeDriverPhone(dto.phone),
        vehicleInfo: cleanText(dto.vehicleInfo),
        isActive: dto.isActive,
      },
      select: driverSelect,
    });
  }

  /** Los pedidos que despachó conservan nombre y celular (copia en el pedido) */
  async remove(restaurantId: string, driverId: string) {
    await this.assertOwned(restaurantId, driverId);
    await this.prisma.deliveryDriver.delete({ where: { id: driverId } });
    return { success: true };
  }

  private async assertOwned(restaurantId: string, driverId: string) {
    const driver = await this.prisma.deliveryDriver.findFirst({ where: { id: driverId, restaurantId }, select: { id: true } });
    if (!driver) throw new NotFoundException('Repartidor no encontrado');
  }
}
