import { ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeRestaurant } from '../restaurants/sanitize-restaurant';
import { CreateTenantDto } from './dto/create-tenant.dto';

const BCRYPT_ROUNDS = 10;
/** Plan por defecto para los restaurantes creados desde el panel (creado por el seed) */
const DEFAULT_PLAN_ID = 'plan-cloud-base';

const userSelect = { id: true, email: true, name: true, role: true, createdAt: true } as const;

/** Campo único violado -> mensaje para el SuperAdmin */
const UNIQUE_MESSAGES: Record<string, string> = {
  slug: 'El slug ya está en uso por otro restaurante',
  subdomain: 'El subdominio ya está en uso por otro restaurante',
  email: 'El email del dueño ya está registrado',
};

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Todos los tickets de soporte de la plataforma con su restaurante, del más reciente al más antiguo */
  findAllTickets() {
    return this.prisma.supportTicket.findMany({
      orderBy: { createdAt: 'desc' },
      include: { restaurant: { select: { id: true, name: true, slug: true } } },
    });
  }

  /** Todos los restaurantes con sus usuarios (y el dueño destacado), sin credenciales de Meta */
  async findAllRestaurants() {
    const restaurants = await this.prisma.restaurant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        users: { select: userSelect, orderBy: { createdAt: 'asc' } },
        plan: { select: { id: true, name: true } },
      },
    });
    return restaurants.map((restaurant) =>
      sanitizeRestaurant({
        ...restaurant,
        owner: restaurant.users.find((u) => u.role === Role.OWNER) ?? null,
      }),
    );
  }

  /** Crea restaurante + dueño (OWNER) de forma atómica: o se crean ambos o ninguno */
  async createRestaurant(dto: CreateTenantDto) {
    const hashedPassword = await bcrypt.hash(dto.ownerPassword, BCRYPT_ROUNDS);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const plan =
          (await tx.plan.findUnique({ where: { id: DEFAULT_PLAN_ID } })) ?? (await tx.plan.findFirst());
        if (!plan) {
          throw new InternalServerErrorException('No hay ningún plan creado (ejecuta el seed)');
        }

        const restaurant = await tx.restaurant.create({
          data: {
            name: dto.restaurantName,
            slug: dto.slug,
            subdomain: dto.slug,
            planId: plan.id,
          },
        });

        const owner = await tx.user.create({
          data: {
            name: dto.ownerName,
            email: dto.ownerEmail,
            password: hashedPassword,
            role: Role.OWNER,
            restaurantId: restaurant.id,
          },
          select: userSelect,
        });

        return sanitizeRestaurant({ ...restaurant, users: [owner], owner, plan: { id: plan.id, name: plan.name } });
      });
    } catch (error) {
      // Las restricciones únicas de la BD son la fuente de verdad (sin carreras entre comprobar e insertar)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const fields = ([] as string[]).concat((error.meta?.target as string[] | string) ?? []);
        const field = fields.find((f) => UNIQUE_MESSAGES[f]);
        throw new ConflictException(field ? UNIQUE_MESSAGES[field] : 'Ya existe un registro con esos datos');
      }
      throw error;
    }
  }
}
