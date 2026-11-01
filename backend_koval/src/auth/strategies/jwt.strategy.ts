import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeUser } from '../auth.service';
import { requireEnv } from '../../config/secrets';
import { isTokenRevoked } from '../token-revocation';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  restaurantId: string | null;
  /** Emitido en (segundos), lo agrega jsonwebtoken al firmar */
  iat?: number;
}

export type AuthenticatedUser = Awaited<ReturnType<JwtStrategy['validate']>>;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireEnv('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // Se consulta la BD en cada request: rol y restaurante siempre actualizados
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        restaurant: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no autorizado o no encontrado');
    }
    // Desactivación en tiempo real: un token aún vigente deja de servir en la siguiente petición
    if (!user.isActive) {
      throw new UnauthorizedException('Tu acceso al sistema fue desactivado');
    }
    // Cambio de contraseña: las sesiones abiertas antes del cambio se cierran
    if (isTokenRevoked(payload.iat, user.passwordChangedAt)) {
      throw new UnauthorizedException('Tu contraseña cambió: inicia sesión de nuevo');
    }

    return sanitizeUser(user);
  }
}
