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
import { TwoFactorAuthService } from '../auth/two-factor-auth.service';
import { AuthService } from '../auth/auth.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';

type Manager = TenantUser & { id: string; isTwoFactorEnabled?: boolean };

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
    private readonly twoFactorAuth: TwoFactorAuthService,
    private readonly authService: AuthService,
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

  /**
   * Nueva contraseña para una cuenta KITCHEN. OWNER: solo de su restaurante (otro -> 404);
   * SUPERADMIN: de cualquiera. Con 2FA activo en la cuenta del gestor exige Sudo Mode.
   * Cierra las sesiones abiertas del empleado (JWT anteriores y WebSockets del KDS).
   */
  async resetEmployeePassword(user: Manager, targetId: string, password: string, sudoToken?: string | string[]) {
    this.assertManager(user);
    if (user.isTwoFactorEnabled) {
      await this.twoFactorAuth.assertSudo({ user: { id: user.id, isTwoFactorEnabled: true }, sudoToken });
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true, restaurantId: true },
    });
    // Usuarios de otro restaurante: 404 para no revelar que existen
    if (!target || (user.role === Role.OWNER && target.restaurantId !== user.restaurantId)) {
      throw new NotFoundException('Empleado no encontrado');
    }
    if (target.role !== Role.KITCHEN) {
      throw new ForbiddenException('Solo puedes cambiar la contraseña del personal de cocina');
    }

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { password: await bcrypt.hash(password, 10), passwordChangedAt: new Date() },
      select: employeeSelect,
    });
    this.ordersGateway.disconnectUser(targetId, 'Tu contraseña cambió: inicia sesión de nuevo');
    return updated;
  }

  /**
   * Cualquier usuario cambia su propia contraseña. Exige la actual o, si la cuenta tiene 2FA,
   * Sudo Mode. Cierra todas sus sesiones (otros dispositivos y el KDS) y devuelve un token nuevo
   * para que la sesión desde la que se cambió siga abierta.
   */
  async changeOwnPassword(
    userId: string,
    dto: { currentPassword?: string; newPassword: string },
    sudoToken?: string | string[],
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, restaurantId: true, password: true, isTwoFactorEnabled: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (dto.currentPassword) {
      if (!(await bcrypt.compare(dto.currentPassword, user.password))) {
        // 400 y no 401: el frontend cierra la sesión ante un 401
        throw new BadRequestException('La contraseña actual no es correcta');
      }
    } else if (user.isTwoFactorEnabled) {
      await this.twoFactorAuth.assertSudo({ user, sudoToken });
    } else {
      throw new BadRequestException('Ingresa tu contraseña actual');
    }
    if (await bcrypt.compare(dto.newPassword, user.password)) {
      throw new BadRequestException('La nueva contraseña debe ser distinta de la actual');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(dto.newPassword, 10), passwordChangedAt: new Date() },
    });
    this.ordersGateway.disconnectUser(user.id, 'Tu contraseña cambió: inicia sesión de nuevo');
    return { accessToken: await this.authService.issueAccessToken(user) };
  }
}
