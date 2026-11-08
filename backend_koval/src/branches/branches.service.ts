import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

const branchSelect = {
  id: true,
  name: true,
  address: true,
  phone: true,
  isMain: true,
  isActive: true,
  createdAt: true,
} as const;

const cleanPhone = (phone: string | null | undefined) => (phone === undefined ? undefined : phone?.trim() || null);

/**
 * Sedes de la marca (Ajustes > Sedes). El acceso lo valida TenantGuard en el controlador; aquí cada
 * operación filtra además por restaurantId (una sede de otro local da 404).
 * Siempre hay exactamente una sede principal mientras exista alguna sede activa.
 */
@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  list(restaurantId: string) {
    return this.prisma.branch.findMany({
      where: { restaurantId },
      orderBy: [{ isMain: 'desc' }, { isActive: 'desc' }, { name: 'asc' }],
      select: branchSelect,
    });
  }

  /** Carta pública: sedes activas para elegir dónde recoger (sin datos internos) */
  listPublic(restaurantId: string) {
    return this.prisma.branch.findMany({
      where: { restaurantId, isActive: true },
      orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, address: true, isMain: true },
    });
  }

  async create(restaurantId: string, dto: CreateBranchDto) {
    const name = dto.name?.trim();
    const address = dto.address?.trim();
    if (!name) throw new BadRequestException('El nombre de la sede es obligatorio');
    if (!address) throw new BadRequestException('La dirección de la sede es obligatoria');
    // La primera sede es la principal aunque no se marque
    const hasMain = await this.prisma.branch.count({ where: { restaurantId, isMain: true, isActive: true } });
    const isMain = Boolean(dto.isMain) || hasMain === 0;
    return this.prisma.$transaction(async (tx) => {
      if (isMain) await tx.branch.updateMany({ where: { restaurantId, isMain: true }, data: { isMain: false } });
      return tx.branch.create({
        data: { restaurantId, name, address, phone: cleanPhone(dto.phone) ?? null, isMain },
        select: branchSelect,
      });
    });
  }

  async update(restaurantId: string, branchId: string, dto: UpdateBranchDto) {
    const current = await this.findOwned(restaurantId, branchId);
    const name = dto.name === undefined ? undefined : dto.name.trim();
    const address = dto.address === undefined ? undefined : dto.address.trim();
    if (name === '') throw new BadRequestException('El nombre de la sede es obligatorio');
    if (address === '') throw new BadRequestException('La dirección de la sede es obligatoria');

    const willBeActive = dto.isActive ?? current.isActive;
    const willBeMain = (dto.isMain ?? current.isMain) && willBeActive;
    if (current.isMain && !willBeMain) {
      // La principal no se puede quitar sin designar otra: la otra sede se marca como principal
      throw new BadRequestException('Marca otra sede como principal antes de quitarle ese rol a esta');
    }
    return this.prisma.$transaction(async (tx) => {
      if (willBeMain && !current.isMain) {
        await tx.branch.updateMany({ where: { restaurantId, isMain: true }, data: { isMain: false } });
      }
      return tx.branch.update({
        where: { id: branchId },
        data: { name, address, phone: cleanPhone(dto.phone), isActive: dto.isActive, isMain: willBeMain },
        select: branchSelect,
      });
    });
  }

  /** Zonas, repartidores, cocinas y pedidos de la sede quedan sin sede (van a la principal) */
  async remove(restaurantId: string, branchId: string) {
    const current = await this.findOwned(restaurantId, branchId);
    const others = await this.prisma.branch.count({ where: { restaurantId, id: { not: branchId } } });
    if (current.isMain && others > 0) {
      throw new BadRequestException('Marca otra sede como principal antes de eliminar esta');
    }
    await this.prisma.branch.delete({ where: { id: branchId } });
    return { deleted: true };
  }

  private async findOwned(restaurantId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, restaurantId },
      select: { id: true, isMain: true, isActive: true },
    });
    if (!branch) throw new NotFoundException('Sede no encontrada');
    return branch;
  }
}
