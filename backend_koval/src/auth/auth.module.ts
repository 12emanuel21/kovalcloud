import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RolesGuard } from './guards/roles.guard';
import { requireEnv } from '../config/secrets';
import { TenantGuard } from './guards/tenant.guard';
import { SudoGuard } from './guards/sudo.guard';
import { TwoFactorAuthService } from './two-factor-auth.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: requireEnv('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RolesGuard, TenantGuard, SudoGuard, TwoFactorAuthService],
  exports: [AuthService, JwtStrategy, PassportModule, JwtModule, RolesGuard, TenantGuard, SudoGuard, TwoFactorAuthService],
})
export class AuthModule {}
