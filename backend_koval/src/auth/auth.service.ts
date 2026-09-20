import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, role } = registerDto;
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Validar unicidad del correo
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('El correo electrónico ya se encuentra registrado');
    }

    // 2. Hashear contraseña con bcrypt (10 rounds)
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Guardar usuario
    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        role: role ?? Role.RESTAURANT_OWNER,
      },
      include: {
        restaurant: true,
      },
    });

    // 4. Generar token JWT firmado
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        restaurant: user.restaurant,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Buscar usuario por correo incluyendo datos del restaurante
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        restaurant: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales incorrectas (correo o contraseña no válidos)');
    }

    // 2. Validar contraseña con bcrypt.compare
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales incorrectas (correo o contraseña no válidos)');
    }

    // 3. Generar JWT firmado
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        restaurant: user.restaurant,
      },
    };
  }
}
