import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersGateway } from '../orders/orders.gateway';
import { resolveTenantFilter, type TenantUser } from '../auth/tenant-access';
import { CreateEmployeeDto } from './dto/create-employee.dto';

type Manager = TenantUser & { id: string };

/** Campos que se devuelven de un empleado (nunca la contraseña ni el secreto 2FA) */
const employeeSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  restaurantId: true,
  createdAt: true,
} as const;

/**
 * Gestión del equipo de un restaurante (cuentas KITCHEN).
 * - OWNER: solo empleados KITCHEN de su propio restaurante; nunca otros OWNER.
 * - SUPERADMIN: cualquier restaurante; nunca otro SUPERADMIN.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersGateway: OrdersGateway,
  ) {}

  private assertManager(user: Manager) {
    if (user.role !== Role.OWNER && user.role !== Role.SUPERADMIN) {
      throw new ForbiddenException('No tienes permisos para gestionar el equipo');
    }
  }

  async listEmployees(user: Manager, requestedRestaurantId?: string) {
    this.assertManager(user);
    const restaurantId = resolveTenantFilter(user, requestedRestaurantId);
    return this.prisma.user.findMany({
      where: { role: Role.KITCHEN, ...(restaurantId ? { restaurantId } : {}) },
      select: employeeSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  async createEmployee(user: Manager, dto: CreateEmployeeDto) {
    this.assertManager(user);
    const restaurantId = resolveTenantFilter(user, dto.restaurantId);
    if (!restaurantId) {
      throw new BadRequestException('Indica el restaurantId del empleado');
    }

    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } });
    if (!restaurant) throw new NotFoundException('El restaurante indicado no existe');

    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ConflictException('El correo electrónico ya se encuentra registrado');

    return this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        password: await bcrypt.hash(dto.password, 10),
        role: Role.KITCHEN,
        restaurantId,
      },
      select: employeeSelect,
    });
  }

  async updateStatus(user: Manager, targetId: string, isActive: boolean) {
    this.assertManager(user);
    if (targetId === user.id) {
      throw new ForbiddenException('No puedes cambiar el acceso de tu propia cuenta');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true, restaurantId: true },
    });

    if (user.role === Role.OWNER) {
      // Usuarios de otro restaurante: 404 para no revelar que existen
      if (!target || target.restaurantId !== user.restaurantId) {
        throw new NotFoundException('Empleado no encontrado');
      }
      if (target.role !== Role.KITCHEN) {
        throw new ForbiddenException('Solo puedes gestionar cuentas del personal de cocina');
      }
    } else {
      if (!target) throw new NotFoundException('Usuario no encontrado');
      if (target.role === Role.SUPERADMIN) {
        throw new ForbiddenException('No se puede modificar el acceso de un SUPERADMIN');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { isActive },
      select: employeeSelect,
    });

    // Revocación inmediata: los JWT ya fallan en la siguiente petición (JwtStrategy
    // consulta isActive); los WebSockets abiertos (KDS) se cierran ahora mismo.
    if (!isActive) this.ordersGateway.disconnectUser(targetId);

    return updated;
  }
}
