import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import * as fs from 'fs';
import * as path from 'path';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class RestaurantsService {
  constructor(private prisma: PrismaService, private aiService: AiService) {}

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

  async importMenuFromPdf(id: string, fileBuffer: Buffer) {
    await this.findOne(id); // Validar que el restaurante existe
    
    
    // Guardar el PDF físico para enviarlo luego por WhatsApp
    const menuDir = path.join(process.cwd(), "uploads", "menus");
    if (!fs.existsSync(menuDir)) fs.mkdirSync(menuDir, { recursive: true });
    fs.writeFileSync(path.join(menuDir, `${id}.pdf`), fileBuffer);
    
    // 1. Extraer el JSON estructurado usando Gemini
    const aiResult = await this.aiService.extractMenuFromPdf(fileBuffer);
    
    // 2. Insertar en bloque usando transacción de Prisma
    return await this.prisma.$transaction(async (tx) => {
      const createdCategories: any[] = [];
      
      for (let i = 0; i < aiResult.categories.length; i++) {
        const cat = aiResult.categories[i];
        
        // Se crea la categoría y sus items anidados automáticamente
        const newCategory = await tx.menuCategory.create({
          data: {
            name: cat.name,
            order: i,
            restaurantId: id,
            items: {
              create: cat.items.map(item => ({
                name: item.name,
                description: item.description,
                price: item.price,
                restaurantId: id,
              }))
            }
          },
          include: { items: true }
        });
        
        createdCategories.push(newCategory);
      }
      
      return { 
        message: "Menú importado y digitalizado exitosamente", 
        categoriesCount: createdCategories.length,
        categories: createdCategories 
      };
    });
  }
}
