import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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
import { normalizeHeader, parseMenuSpreadsheet } from './menu-spreadsheet';
import { isOnlinePaymentEnabled, isWompiReady } from '../payments/wompi-checkout.service';
import { publicWhatsAppNumber } from './whatsapp-bot-number';
import { resolveMenuColorMode, resolveMenuLayout, resolveMenuTheme } from './menu-themes';
import { TwoFactorAuthService, type SudoCredentials } from '../auth/two-factor-auth.service';

const userSelect = { id: true, email: true, name: true, role: true } as const;

const wompiSelect = {
  isWompiEnabled: true,
  wompiPublicKey: true,
  wompiPrivateKey: true,
  wompiEventSecret: true,
  wompiIntegritySecret: true,
} as const;

/** Credenciales de Meta (WhatsApp Cloud API): cambiarlas también exige Sudo Mode */
const metaSelect = {
  whatsappToken: true,
  whatsappPhoneId: true,
  whatsappWabaId: true,
  whatsappVerifyToken: true,
  metaAppSecret: true,
} as const;

/**
 * ¿El pedido cambia algún campo sensible respecto a lo guardado? undefined = no se toca;
 * vacío y null cuentan igual. Reenviar el mismo valor (el formulario lo hace) no cuenta.
 */
function changesSensitiveFields(current: Record<string, unknown>, next: Record<string, string | null | undefined>) {
  return Object.entries(next).some(([field, value]) => value !== undefined && (value || null) !== (current[field] || null));
}

/** Las 4 llaves de Wompi (pública, privada, eventos e integridad) guardadas */
function hasAllWompiKeys(r: Record<string, unknown>): boolean {
  return Boolean(r.wompiPublicKey && r.wompiPrivateKey && r.wompiEventSecret && r.wompiIntegritySecret);
}

export { toWhatsAppNumber } from './whatsapp-bot-number';

/** Estado de Wompi para el dashboard: la llave pública completa, los secretos solo enmascarados */
function toPaymentsConfig(r: {
  isWompiEnabled: boolean;
  wompiPublicKey: string | null;
  wompiPrivateKey: string | null;
  wompiEventSecret: string | null;
  wompiIntegritySecret: string | null;
}) {
  return {
    wompiPublicKey: r.wompiPublicKey,
    wompiEnvironment: r.wompiPublicKey?.startsWith('pub_prod_') ? 'production' : r.wompiPublicKey ? 'sandbox' : null,
    hasWompiPrivateKey: Boolean(r.wompiPrivateKey),
    wompiPrivateKeyMasked: maskSecret(r.wompiPrivateKey),
    hasWompiEventSecret: Boolean(r.wompiEventSecret),
    wompiEventSecretMasked: maskSecret(r.wompiEventSecret),
    hasWompiIntegritySecret: Boolean(r.wompiIntegritySecret),
    wompiIntegritySecretMasked: maskSecret(r.wompiIntegritySecret),
    /** Llaves completas: link de pago (pública + integridad) y webhook (eventos) */
    wompiReady: isWompiReady(r),
    /** Interruptor manual del dueño */
    isWompiEnabled: r.isWompiEnabled,
    /** Cobrando de verdad: llaves completas e interruptor encendido */
    onlinePaymentsEnabled: isOnlinePaymentEnabled(r),
  };
}

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
  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
    private twoFactorAuth: TwoFactorAuthService,
  ) {}

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
    // Carta pública: sanitizeRestaurant deja solo wompiPublicKey (nunca los secretos).
    // isWompiEnabled es el interruptor del dueño; onlinePaymentsEnabled (interruptor + llaves completas)
    // indica si el carrito debe ofrecer "Pagar en línea".
    return {
      ...sanitizeRestaurant(restaurant),
      isWompiEnabled: restaurant.isWompiEnabled,
      onlinePaymentsEnabled: isOnlinePaymentEnabled(restaurant),
      // Número para wa.me (solo dígitos, con indicativo): la SIM/línea conectada al bot y, si no hay
      // sesión vinculada, el teléfono del local. null oculta el botón de WhatsApp de la carta.
      whatsappNumber: publicWhatsAppNumber(restaurant),
      // Tema visual de la carta (data-theme): siempre uno válido, street-burger si falta
      theme: resolveMenuTheme(restaurant.theme),
      // Modo con el que abre la carta (después manda la elección del cliente)
      menuColorMode: resolveMenuColorMode(restaurant.menuColorMode, restaurant.theme),
      // Estructura de los platos (visual-grid si falta o no existe)
      layout: resolveMenuLayout(restaurant.layout),
    };
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

  /** Identidad del local y credenciales de Meta; estas últimas solo en Sudo Mode */
  async update(id: string, updateRestaurantDto: UpdateRestaurantDto, sudo: SudoCredentials) {
    const current = await this.prisma.restaurant.findUnique({ where: { id }, select: metaSelect });
    if (!current) throw new NotFoundException('Restaurante no encontrado');

    const meta = {
      whatsappToken: updateRestaurantDto.whatsappToken,
      whatsappPhoneId: updateRestaurantDto.whatsappPhoneId,
      whatsappWabaId: updateRestaurantDto.whatsappWabaId,
      whatsappVerifyToken: updateRestaurantDto.whatsappVerifyToken,
      // Vacío = no cambiar (el formulario no conoce el valor guardado)
      metaAppSecret: updateRestaurantDto.metaAppSecret?.trim() || undefined,
    };
    if (changesSensitiveFields(current, meta)) await this.twoFactorAuth.assertSudo(sudo);

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
        theme: updateRestaurantDto.theme,
        menuColorMode: updateRestaurantDto.menuColorMode,
        layout: updateRestaurantDto.layout,
        ...meta,
      },
      include: {
        users: { select: userSelect },
        plan: true,
      },
    });
    return toRestaurantResponse(updated);
  }

  /**
   * Configuración operativa del local: dirección, pagos, horarios, cierre de emergencia y tema
   * se guardan sin más; cambiar las llaves de Wompi exige Sudo Mode.
   */
  async updateConfig(id: string, dto: UpdateRestaurantConfigDto, sudo: SudoCredentials) {
    const current = await this.prisma.restaurant.findUnique({ where: { id }, select: wompiSelect });
    if (!current) throw new NotFoundException('Restaurante no encontrado');

    // Texto vacío o null = borrar; ausente (undefined) = no tocar
    const text = (value: string | null | undefined) =>
      value === undefined ? undefined : value?.trim() || null;
    // Secretos: ausente o "" = conservar el guardado; null = borrar
    const secret = (value: string | null | undefined) =>
      value === null ? null : value?.trim() ? value.trim() : undefined;

    const wompi = {
      wompiPublicKey: text(dto.wompiPublicKey),
      wompiPrivateKey: secret(dto.wompiPrivateKey),
      wompiEventSecret: secret(dto.wompiEventSecret),
      wompiIntegritySecret: secret(dto.wompiIntegritySecret),
    };
    if (changesSensitiveFields(current, wompi)) await this.twoFactorAuth.assertSudo(sudo);

    // Interruptor manual: encenderlo (o dejarlo encendido) exige llaves completas tras este guardado.
    // Apagarlo siempre se permite y no pide Sudo Mode (es la forma rápida de dejar de cobrar en línea).
    const merged = Object.fromEntries(
      Object.entries(wompi).map(([field, value]) => [field, value === undefined ? current[field as keyof typeof wompi] : value]),
    ) as Record<keyof typeof wompi, string | null>;
    // Primera vez que quedan las 4 llaves completas: se enciende solo, salvo que se envíe false.
    // Si el dueño lo apagó y luego cambia una llave, no se vuelve a encender (las llaves ya estaban completas).
    const autoEnable = dto.isWompiEnabled === undefined && !hasAllWompiKeys(current) && hasAllWompiKeys(merged);
    const willBeEnabled = autoEnable || (dto.isWompiEnabled ?? current.isWompiEnabled);
    if (dto.isWompiEnabled === true || (willBeEnabled && Object.values(wompi).some((v) => v !== undefined))) {
      if (willBeEnabled && !isWompiReady(merged)) {
        throw new BadRequestException(
          'Para habilitar los cobros en línea completa la llave pública, el secreto de eventos y el secreto de integridad de Wompi',
        );
      }
    }

    const { isWompiEnabled, wompiPublicKey, wompiPrivateKey, wompiEventSecret, wompiIntegritySecret, ...config } =
      await this.prisma.restaurant.update({
      where: { id },
      data: {
        address: text(dto.address),
        paymentDetails: text(dto.paymentDetails),
        closedMessage: text(dto.closedMessage),
        isTemporarilyClosed: dto.isTemporarilyClosed,
        theme: dto.theme,
        isWompiEnabled: autoEnable ? true : dto.isWompiEnabled,
        ...wompi,
        // Kill switch: activar la emergencia destruye cualquier prórroga vigente
        ...(dto.isTemporarilyClosed === true ? { extendedUntil: null } : {}),
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
        theme: true,
        ...wompiSelect,
      },
    });
    return {
      ...config,
      ...toPaymentsConfig({ isWompiEnabled, wompiPublicKey, wompiPrivateKey, wompiEventSecret, wompiIntegritySecret }),
    };
  }

  /** Configuración de Wompi del local para Ajustes (secretos enmascarados) */
  async findPaymentsConfig(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id }, select: wompiSelect });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');
    return toPaymentsConfig(restaurant);
  }

  /**
   * Prórroga de horario: abre el local durante `minutes` minutos desde ahora,
   * por encima del horario y del cierre de emergencia. null/0 la cancela.
   */
  async extendHours(id: string, minutes: number | null | undefined) {
    const restaurant = await this.findOne(id);
    // Con el cierre de emergencia activo no se puede prorrogar (cancelar sí está permitido)
    if (minutes && restaurant.isTemporarilyClosed) {
      throw new ConflictException('El cierre de emergencia está activo: desactívalo antes de prorrogar el horario');
    }
    const extendedUntil = minutes ? new Date(Date.now() + minutes * 60_000) : null;
    return this.prisma.restaurant.update({
      where: { id },
      data: { extendedUntil },
      select: { id: true, extendedUntil: true },
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

  /**
   * Carga masiva desde Excel/CSV (columnas: Categoría, Nombre, Descripción, Precio, Disponible, URL Imagen).
   * Todo o nada: primero se valida el archivo completo (400 con la lista de filas con error) y
   * luego se inserta en una sola transacción. Las categorías existentes se reutilizan por nombre.
   */
  async importMenuFromSpreadsheet(id: string, fileBuffer: Buffer, filename: string) {
    await this.findOne(id);

    const { rows, errors, warnings } = parseMenuSpreadsheet(fileBuffer, filename);
    if (errors.length) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: ['No se importó ningún plato. Corrige el archivo y vuelve a subirlo:', ...errors],
      });
    }

    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.menuCategory.findMany({
          where: { restaurantId: id, deletedAt: null },
          select: { id: true, name: true, order: true },
        });
        // Nombre normalizado (sin tildes ni mayúsculas) -> id, para no duplicar categorías
        const categoryIds = new Map(existing.map((c) => [normalizeHeader(c.name), c.id]));
        let nextOrder = existing.reduce((max, c) => Math.max(max, c.order), -1) + 1;
        let categoriesCreated = 0;

        for (const { category } of rows) {
          const key = normalizeHeader(category);
          if (categoryIds.has(key)) continue;
          const created = await tx.menuCategory.create({
            data: { name: category, order: nextOrder++, restaurantId: id },
            select: { id: true },
          });
          categoryIds.set(key, created.id);
          categoriesCreated++;
        }

        const { count } = await tx.menuItem.createMany({
          data: rows.map((row) => ({
            name: row.name,
            description: row.description,
            price: row.price,
            isAvailable: row.isAvailable,
            imageUrl: row.imageUrl,
            restaurantId: id,
            categoryId: categoryIds.get(normalizeHeader(row.category))!,
          })),
        });

        const categoriesUsed = new Set(rows.map((row) => normalizeHeader(row.category))).size;
        return {
          message: `Menú importado: ${count} platos en ${categoriesUsed} categorías (${categoriesCreated} nuevas)`,
          itemsCreated: count,
          categoriesCreated,
          warnings,
        };
      },
      { timeout: 30_000 },
    );
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
