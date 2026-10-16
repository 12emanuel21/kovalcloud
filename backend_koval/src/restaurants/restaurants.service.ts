import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import * as fs from 'fs';
import * as path from 'path';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { maskSecret, sanitizeRestaurant } from './sanitize-restaurant';
import { UpdateRestaurantConfigDto } from './dto/update-restaurant-config.dto';
import { parseBusinessHours } from './business-hours';

const userSelect = { id: true, email: true, name: true, role: true } as const;

/**
 * Respuesta pública de un restaurante: sin credenciales de Meta y con `owner`
 * (primer dueño) por compatibilidad con el frontend.
 */
function toRestaurantResponse<T extends { users: { role: Role }[] }>(restaurant: T) {
  return sanitizeRestaurant({
    ...restaurant,
    owner: restaurant.users.find((u) => u.role === Role.OWNER) ?? null,
  });
}

@Injectable()
export class RestaurantsService {
  constructor(private prisma: PrismaService, private aiService: AiService) {}

  async findBySlug(slug: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { slug },
      include: {
        categories: {
          where: { deletedAt: null },
          orderBy: { order: 'asc' },
          include: {
            // Los agotados (isAvailable=false) se muestran en la carta marcados como "Agotado";
            // solo se ocultan los borrados. POST /orders sigue rechazando platos agotados.
            items: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');
    return sanitizeRestaurant(restaurant);
  }

  async create(createRestaurantDto: CreateRestaurantDto) {
    const { name, slug, ownerEmail, ownerPassword, planId } = createRestaurantDto;
    const subdomain = createRestaurantDto.subdomain ?? slug;

    const existingSlug = await this.prisma.restaurant.findUnique({ where: { slug } });
    if (existingSlug) throw new ConflictException('El slug del restaurante ya está en uso');

    const existingSubdomain = await this.prisma.restaurant.findUnique({ where: { subdomain } });
    if (existingSubdomain) throw new ConflictException('El subdominio ya está en uso');

    const existingUser = await this.prisma.user.findUnique({ where: { email: ownerEmail } });
    if (existingUser) throw new ConflictException('El correo del dueño ya está registrado');

    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('El plan seleccionado no existe');

    // Hashear la contraseña del dueño con bcrypt
    const hashedPassword = await bcrypt.hash(ownerPassword, 10);

    return await this.prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: {
          name,
          slug,
          subdomain,
          planId: plan.id,
          users: {
            create: {
              email: ownerEmail.toLowerCase().trim(),
              name: createRestaurantDto.ownerName?.trim() || `Dueño de ${name}`,
              password: hashedPassword,
              role: Role.OWNER,
            },
          },
        },
        include: {
          users: { select: userSelect },
          plan: true,
        },
      });

      return toRestaurantResponse(restaurant);
    });
  }

  async findAll() {
    const restaurants = await this.prisma.restaurant.findMany({
      include: {
        users: { select: userSelect },
        plan: true,
      },
    });
    return restaurants.map(toRestaurantResponse);
  }

  async findOne(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      include: {
        users: { select: userSelect },
        plan: true,
      },
    });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');
    return toRestaurantResponse(restaurant);
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

    if (updateRestaurantDto.subdomain) {
      const existingSubdomain = await this.prisma.restaurant.findUnique({
        where: { subdomain: updateRestaurantDto.subdomain },
      });
      if (existingSubdomain && existingSubdomain.id !== id) {
        throw new ConflictException('El subdominio ingresado ya está en uso por otro restaurante');
      }
    }

    const updated = await this.prisma.restaurant.update({
      where: { id },
      data: {
        name: updateRestaurantDto.name,
        slug: updateRestaurantDto.slug,
        subdomain: updateRestaurantDto.subdomain,
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
        // Vacío = no cambiar (el formulario no conoce el valor guardado)
        metaAppSecret: updateRestaurantDto.metaAppSecret?.trim() || undefined,
      },
      include: {
        users: { select: userSelect },
        plan: true,
      },
    });
    return toRestaurantResponse(updated);
  }

  /** Configuración operativa del local: dirección, pagos, horarios y cierre de emergencia */
  async updateConfig(id: string, dto: UpdateRestaurantConfigDto) {
    await this.findOne(id);

    // Texto vacío o null = borrar; ausente (undefined) = no tocar
    const text = (value: string | null | undefined) =>
      value === undefined ? undefined : value?.trim() || null;

    return this.prisma.restaurant.update({
      where: { id },
      data: {
        address: text(dto.address),
        paymentDetails: text(dto.paymentDetails),
        closedMessage: text(dto.closedMessage),
        isTemporarilyClosed: dto.isTemporarilyClosed,
        businessHours:
          dto.businessHours === undefined
            ? undefined
            : dto.businessHours === null
              ? Prisma.DbNull
              : (parseBusinessHours(dto.businessHours) as Prisma.InputJsonValue),
      },
      select: {
        id: true,
        address: true,
        paymentDetails: true,
        businessHours: true,
        isTemporarilyClosed: true,
        closedMessage: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    const deleted = await this.prisma.restaurant.delete({
      where: { id },
    });
    return sanitizeRestaurant(deleted);
  }

  /**
   * Configuración de WhatsApp para el dashboard del propio restaurante.
   * El token de Meta nunca se devuelve completo, solo enmascarado.
   */
  async findWhatsappConfig(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        botpressBotId: true,
        whatsappToken: true,
        whatsappPhoneId: true,
        whatsappWabaId: true,
        whatsappVerifyToken: true,
        metaAppSecret: true,
      },
    });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');

    const { whatsappToken, metaAppSecret, ...config } = restaurant;
    return {
      ...config,
      hasWhatsappToken: Boolean(whatsappToken),
      whatsappTokenMasked: maskSecret(whatsappToken),
      hasMetaAppSecret: Boolean(metaAppSecret),
      metaAppSecretMasked: maskSecret(metaAppSecret),
    };
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
