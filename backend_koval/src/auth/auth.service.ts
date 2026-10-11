import { authenticator } from 'otplib';

import * as qrcode from 'qrcode';
import {
  Injectable,
  BadRequestException,
  ConflictException,
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

  async generateTwoFactorSecret(userId: string, email: string) {
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

  async verifyTwoFactorCode(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret) return false;

    const isCodeValid = authenticator.verify({
      token: code,
      secret: user.twoFactorSecret,
    });

    if (isCodeValid && !user.isTwoFactorEnabled) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { isTwoFactorEnabled: true },
      });
    }

    return isCodeValid;
  }
}
