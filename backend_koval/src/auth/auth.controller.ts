import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { KitchenAccess } from './decorators/kitchen-access.decorator';
import { AuthenticatedUser } from './strategies/jwt.strategy';
import { TwoFactorThrottlerGuard } from './guards/two-factor-throttler.guard';

type AuthenticatedRequest = { user: AuthenticatedUser };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Solo el SUPERADMIN crea cuentas: los restaurantes no se registran solos
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN)
  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @KitchenAccess()
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req: AuthenticatedRequest) {
    return req.user;
  }

  // Paso 1: secreto pendiente + QR (rechazado si el 2FA ya está activo)
  @KitchenAccess()
  @UseGuards(JwtAuthGuard)
  @Post('2fa/generate')
  async register2FA(@Request() req: AuthenticatedRequest) {
    return this.authService.generateTwoFactorSecret(req.user.id, req.user.email);
  }

  // Paso 2: confirma el código de la app y activa el 2FA
  @KitchenAccess()
  @UseGuards(JwtAuthGuard, TwoFactorThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('2fa/enable')
  enable2FA(@Request() req: AuthenticatedRequest, @Body('code') code: unknown) {
    return this.authService.enableTwoFactor(req.user.id, code);
  }

  // Sudo Mode: código válido -> sudoToken de 30 min (header x-sudo-token en rutas sensibles)
  @UseGuards(JwtAuthGuard, TwoFactorThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('2fa/verify-sudo')
  verifySudo(@Request() req: AuthenticatedRequest, @Body('code') code: unknown) {
    return this.authService.issueSudoToken(req.user.id, code);
  }
}
