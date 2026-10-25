import { authenticator } from 'otplib';

import * as qrcode from 'qrcode';
import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Restaurant, Role, User } from '@prisma/client';
import type { JwtPayload } from './strategies/jwt.strategy';
import { sanitizeRestaurant } from '../restaurants/sanitize-restaurant';
import { SUDO_SCOPE, SUDO_TOKEN_TTL_SECONDS, sudoTokenSecret, type SudoTokenPayload } from './sudo';

/** TOTP con ±1 ventana de 30 s de tolerancia (relojes de celular desfasados) */
const totp = authenticator.clone({ window: 1 });

/** Código de 6 dígitos válido para el secreto */
export function isValidTotp(code: unknown, secret: string): boolean {
  return typeof code === 'string' && /^\d{6}$/.test(code) && totp.verify({ token: code, secret });
}

/**
 * Elimina campos sensibles antes de devolver un usuario al cliente,
 * incluidas las credenciales de Meta de su restaurante si viene incluido.
 */
export function sanitizeUser<T extends User & { restaurant?: Restaurant | null }>(user: T) {
  const { password, twoFactorSecret, restaurant, ...safeUser } = user;
  return {
    ...safeUser,
    restaurant: restaurant ? sanitizeRestaurant(restaurant) : restaurant,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Crea un usuario. Solo invocable por SUPERADMIN (protegido en el controlador):
   * los restaurantes no se registran solos.
   */
  async register(registerDto: RegisterDto) {
    const { email, password, name, restaurantId } = registerDto;
    const role = registerDto.role ?? Role.OWNER;
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Validar coherencia rol <-> restaurante
    if (role === Role.SUPERADMIN && restaurantId) {
      throw new BadRequestException('Un SUPERADMIN no puede pertenecer a un restaurante');
    }
    if (role !== Role.SUPERADMIN) {
      if (!restaurantId) {
        throw new BadRequestException(`restaurantId es obligatorio para ${role}`);
      }
      const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
      if (!restaurant) {
        throw new NotFoundException('El restaurante indicado no existe');
      }
    }

    // 2. Validar unicidad del correo
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      throw new ConflictException('El correo electrónico ya se encuentra registrado');
    }

    // 3. Hashear contraseña con bcrypt (10 rounds) y guardar
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        name,
        role,
        restaurantId: role === Role.SUPERADMIN ? null : restaurantId,
      },
      include: { restaurant: true },
    });

    // No se emite token: quien registra es el SUPERADMIN, no el nuevo usuario
    return { user: sanitizeUser(user) };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Buscar usuario por correo incluyendo datos del restaurante
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { restaurant: true },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales incorrectas (correo o contraseña no válidos)');
    }

    // 2. Validar contraseña con bcrypt.compare
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales incorrectas (correo o contraseña no válidos)');
    }

    // Cuenta revocada por el dueño (Ajustes > Equipo). Tras validar la contraseña para no
    // revelar a terceros si el correo existe.
    if (!user.isActive) {
      throw new ForbiddenException('Tu acceso al sistema fue desactivado. Contacta al administrador del local.');
    }

    // 3. Generar JWT firmado (incluye el tenant para filtrar datos por restaurante)
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      restaurantId: user.restaurantId,
    };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: sanitizeUser(user),
    };
  }

  /**
   * Paso 1 del 2FA: genera un secreto pendiente y su QR. Si el 2FA ya está activo se rechaza:
   * regenerarlo con solo la sesión permitiría a quien robe el token anular el Sudo Mode.
   */
  async generateTwoFactorSecret(userId: string, email: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isTwoFactorEnabled: true } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.isTwoFactorEnabled) throw new ConflictException('La autenticación en 2 pasos ya está activa');

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(email, 'KovalCloud', secret);

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret },
    });

    return {
      secret,
      qrCodeUrl: await qrcode.toDataURL(otpauthUrl),
    };
  }

  /** Paso 2: confirma el secreto pendiente con un código de la app y activa el 2FA */
  async enableTwoFactor(userId: string, code: unknown) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.isTwoFactorEnabled) throw new ConflictException('La autenticación en 2 pasos ya está activa');
    if (!user.twoFactorSecret) throw new BadRequestException('Primero genera el código QR');
    if (!isValidTotp(code, user.twoFactorSecret)) throw new UnauthorizedException('Código 2FA inválido');

    await this.prisma.user.update({ where: { id: userId }, data: { isTwoFactorEnabled: true } });
    return { isTwoFactorEnabled: true };
  }

  /** Sudo Mode: con un código válido emite un sudoToken de 30 minutos (header x-sudo-token) */
  async issueSudoToken(userId: string, code: unknown) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isTwoFactorEnabled: true, twoFactorSecret: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (!user.isTwoFactorEnabled || !user.twoFactorSecret) {
      throw new ForbiddenException('Activa la autenticación en 2 pasos para usar el modo seguro');
    }
    if (!isValidTotp(code, user.twoFactorSecret)) throw new UnauthorizedException('Código 2FA inválido');

    const payload: SudoTokenPayload = { sub: user.id, scope: SUDO_SCOPE };
    const sudoToken = await this.jwtService.signAsync(payload, {
      secret: sudoTokenSecret(),
      expiresIn: SUDO_TOKEN_TTL_SECONDS,
    });
    return { sudoToken, expiresAt: new Date(Date.now() + SUDO_TOKEN_TTL_SECONDS * 1000).toISOString() };
  }
}
