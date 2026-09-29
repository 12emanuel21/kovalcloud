import { UnauthorizedException,
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req: { user: unknown }) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/generate')
  async register2FA(@Request() req) {
    return this.authService.generateTwoFactorSecret(req.user.id, req.user.email);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/verify')
  async verify2FA(@Request() req, @Body('code') code: string) {
    const isValid = await this.authService.verifyTwoFactorCode(req.user.id, code);
    if (!isValid) {
      throw new UnauthorizedException('Código 2FA inválido');
    }
    return { message: '2FA verificado correctamente' };
  }
}
