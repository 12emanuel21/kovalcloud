import {
  UnauthorizedException,
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
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { KitchenAccess } from './decorators/kitchen-access.decorator';
import { AuthenticatedUser } from './strategies/jwt.strategy';

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

  @KitchenAccess()
  @UseGuards(JwtAuthGuard)
  @Post('2fa/generate')
  async register2FA(@Request() req: AuthenticatedRequest) {
    return this.authService.generateTwoFactorSecret(req.user.id, req.user.email);
  }

  @KitchenAccess()
  @UseGuards(JwtAuthGuard)
  @Post('2fa/verify')
  async verify2FA(@Request() req: AuthenticatedRequest, @Body('code') code: string) {
    const isValid = await this.authService.verifyTwoFactorCode(req.user.id, code);
    if (!isValid) {
      throw new UnauthorizedException('Código 2FA inválido');
    }
    return { message: '2FA verificado correctamente' };
  }
}
