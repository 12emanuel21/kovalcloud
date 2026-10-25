import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { authenticator } from 'otplib';
import { AuthService, isValidTotp } from './auth.service';
import { SudoGuard } from './guards/sudo.guard';
import { TwoFactorAuthService } from './two-factor-auth.service';
import { sudoTokenSecret } from './sudo';

process.env.JWT_SECRET = 'test-jwt-secret';

const SECRET = authenticator.generateSecret();
const jwt = new JwtService({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '7d' } });

const contextFor = (user: unknown, headers: Record<string, string> = {}) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user, headers }) }) }) as any;

describe('2FA y Sudo Mode · AuthService', () => {
  let prisma: any;
  let service: AuthService;
  const userRow = (fields: Record<string, unknown> = {}) => ({
    id: 'user-1',
    email: 'dueno@koval.test',
    isTwoFactorEnabled: false,
    twoFactorSecret: null,
    ...fields,
  });

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) } };
    service = new AuthService(prisma, jwt);
  });

  it('generate: crea secreto pendiente + QR, pero se niega si el 2FA ya está activo', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow());
    const result = await service.generateTwoFactorSecret('user-1', 'dueno@koval.test');
    expect(result.qrCodeUrl).toMatch(/^data:image\/png;base64,/);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { twoFactorSecret: result.secret } });

    prisma.user.update.mockClear();
    prisma.user.findUnique.mockResolvedValue(userRow({ isTwoFactorEnabled: true, twoFactorSecret: SECRET }));
    await expect(service.generateTwoFactorSecret('user-1', 'dueno@koval.test')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled(); // el secreto activo no se sobrescribe
  });

  it('enable: activa con un código válido y rechaza códigos incorrectos o mal formados', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow({ twoFactorSecret: SECRET }));
    await expect(service.enableTwoFactor('user-1', '000000')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.enableTwoFactor('user-1', '12345')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.enableTwoFactor('user-1', authenticator.generate(SECRET))).resolves.toEqual({ isTwoFactorEnabled: true });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { isTwoFactorEnabled: true } });
  });

  it('verify-sudo: emite un token de 30 min firmado con el secreto de sudo (no sirve como token de sesión)', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow({ isTwoFactorEnabled: true, twoFactorSecret: SECRET }));
    const { sudoToken, expiresAt } = await service.issueSudoToken('user-1', authenticator.generate(SECRET));

    const payload = await jwt.verifyAsync(sudoToken, { secret: sudoTokenSecret() });
    expect(payload).toMatchObject({ sub: 'user-1', scope: 'sudo' });
    expect(payload.exp - payload.iat).toBe(30 * 60);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * 60 * 1000);
    // Con JWT_SECRET (lo que usa JwtStrategy) no valida
    await expect(jwt.verifyAsync(sudoToken)).rejects.toThrow();
  });

  it('verify-sudo: 403 sin 2FA activo y 401 con código incorrecto', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow({ twoFactorSecret: SECRET }));
    await expect(service.issueSudoToken('user-1', authenticator.generate(SECRET))).rejects.toBeInstanceOf(ForbiddenException);
    prisma.user.findUnique.mockResolvedValue(userRow({ isTwoFactorEnabled: true, twoFactorSecret: SECRET }));
    await expect(service.issueSudoToken('user-1', '999999')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('isValidTotp solo acepta 6 dígitos', () => {
    expect(isValidTotp(authenticator.generate(SECRET), SECRET)).toBe(true);
    expect(isValidTotp(123456, SECRET)).toBe(false);
    expect(isValidTotp(' 123456', SECRET)).toBe(false);
  });
});

describe('SudoGuard', () => {
  const guard = new SudoGuard(new TwoFactorAuthService(jwt));
  const user = { id: 'user-1', isTwoFactorEnabled: true };
  const sudoFor = (sub: string, expiresIn = 1800, scope = 'sudo') =>
    jwt.signAsync({ sub, scope }, { secret: sudoTokenSecret(), expiresIn });

  const reasonOf = async (promise: Promise<unknown>) => {
    const error: any = await promise.catch((e) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toMatchObject({ message: 'SUDO_REQUIRED' });
    return error.getResponse().reason;
  };

  it('deja pasar con un sudo token vigente del mismo usuario', async () => {
    await expect(guard.canActivate(contextFor(user, { 'x-sudo-token': await sudoFor('user-1') }))).resolves.toBe(true);
  });

  it('SUDO_REQUIRED con el motivo: sin 2FA, sin token, expirado, de otro usuario, sin scope o un token de sesión', async () => {
    const token = await sudoFor('user-1');
    expect(await reasonOf(guard.canActivate(contextFor({ ...user, isTwoFactorEnabled: false }, { 'x-sudo-token': token })))).toBe(
      'TWO_FACTOR_NOT_ENABLED',
    );
    expect(await reasonOf(guard.canActivate(contextFor(user)))).toBe('MISSING');
    expect(await reasonOf(guard.canActivate(contextFor(user, { 'x-sudo-token': await sudoFor('user-1', -10) })))).toBe('EXPIRED');
    expect(await reasonOf(guard.canActivate(contextFor(user, { 'x-sudo-token': await sudoFor('otro-usuario') })))).toBe('INVALID');
    expect(await reasonOf(guard.canActivate(contextFor(user, { 'x-sudo-token': await sudoFor('user-1', 1800, 'login') })))).toBe(
      'INVALID',
    );
    const accessToken = await jwt.signAsync({ sub: 'user-1', email: 'x', role: 'OWNER', restaurantId: 'r1' });
    expect(await reasonOf(guard.canActivate(contextFor(user, { 'x-sudo-token': accessToken })))).toBe('INVALID');
  });
});
