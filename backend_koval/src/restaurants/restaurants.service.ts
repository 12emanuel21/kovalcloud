import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class RestaurantsService {
  constructor(private prisma: PrismaService) {}

  async findBySlug(slug: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { slug },
      include: {
        categories: {
          orderBy: { order: 'asc' },
          include: {
            items: {
              where: { isAvailable: true },
            },
          },
        },
      },
    });

    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');
    return restaurant;
  }

  async create(createRestaurantDto: CreateRestaurantDto) {
    const { name, slug, ownerEmail, ownerPassword, planId } = createRestaurantDto;

    const existingSlug = await this.prisma.restaurant.findUnique({ where: { slug } });
    if (existingSlug) throw new ConflictException('El slug del restaurante ya está en uso');

    const existingUser = await this.prisma.user.findUnique({ where: { email: ownerEmail } });
    if (existingUser) throw new ConflictException('El correo del dueño ya está registrado');

    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('El plan seleccionado no existe');

    // Hashear la contraseña del dueño con bcrypt
    const hashedPassword = await bcrypt.hash(ownerPassword, 10);

    return await this.prisma.$transaction(async (tx) => {
      const owner = await tx.user.create({
        data: {
          email: ownerEmail,
          password: hashedPassword,
          role: Role.RESTAURANT_OWNER,
        },
      });

      const restaurant = await tx.restaurant.create({
        data: {
          name,
          slug,
          ownerId: owner.id,
          planId: plan.id,
        },
        include: {
          owner: {
            select: { id: true, email: true, role: true },
          },
          plan: true,
        },
      });

      return restaurant;
    });
  }

  async findAll() {
    return await this.prisma.restaurant.findMany({
      include: {
        owner: { select: { id: true, email: true } },
        plan: true,
      },
    });
  }

  async findOne(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, email: true, role: true },
        },
        plan: true,
      },
    });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');
    return restaurant;
  }

  async update(id: string, updateRestaurantDto: UpdateRestaurantDto) {
    await this.findOne(id);

    // Si se intenta cambiar el slug, validar unicidad
    if (updateRestaurantDto.slug) {
      const existingSlug = await this.prisma.restaurant.findUnique({
        where: { slug: updateRestaurantDto.slug },
      });
      if (existingSlug && existingSlug.id !== id) {
        throw new ConflictException('El slug ingresado ya está en uso por otro restaurante');
      }
    }

    return await this.prisma.restaurant.update({
      where: { id },
      data: {
        name: updateRestaurantDto.name,
        slug: updateRestaurantDto.slug,
        description: updateRestaurantDto.description,
        phone: updateRestaurantDto.phone,
        logoUrl: updateRestaurantDto.logoUrl,
        bannerUrl: updateRestaurantDto.bannerUrl,
        currency: updateRestaurantDto.currency,
        botpressBotId: updateRestaurantDto.botpressBotId,
        whatsappToken: updateRestaurantDto.whatsappToken,
        whatsappPhoneId: updateRestaurantDto.whatsappPhoneId,
        whatsappWabaId: updateRestaurantDto.whatsappWabaId,
        whatsappVerifyToken: updateRestaurantDto.whatsappVerifyToken,
      },
      include: {
        owner: {
          select: { id: true, email: true, role: true },
        },
        plan: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return await this.prisma.restaurant.delete({
      where: { id },
    });
  }
}