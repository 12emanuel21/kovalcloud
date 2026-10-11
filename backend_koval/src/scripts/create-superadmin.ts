/**
 * Crea (o promueve) la cuenta maestra SUPERADMIN.
 *
 * Uso:
 *   SUPERADMIN_EMAIL=tu@correo.com [SUPERADMIN_PASSWORD=...] [SUPERADMIN_NAME=...] npm run create-superadmin
 *   (en el contenedor de producción: node dist/scripts/create-superadmin.js)
 *
 * - Si no se indica SUPERADMIN_PASSWORD se genera una aleatoria y se muestra UNA sola vez.
 * - Si el email ya existe, se promueve a SUPERADMIN y se desvincula de su restaurante;
 *   la contraseña solo cambia si se pasa SUPERADMIN_PASSWORD.
 * - El SUPERADMIN es global: restaurantId siempre null.
 */
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 12;

async function main() {
  const email = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Define SUPERADMIN_EMAIL con un email válido');
  }

  const envPassword = process.env.SUPERADMIN_PASSWORD;
  if (envPassword !== undefined && envPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`SUPERADMIN_PASSWORD debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  const name = process.env.SUPERADMIN_NAME?.trim() || 'Super Admin';

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      await prisma.user.update({
        where: { email },
        data: {
          role: Role.SUPERADMIN,
          restaurantId: null,
          ...(envPassword ? { password: await bcrypt.hash(envPassword, BCRYPT_ROUNDS) } : {}),
        },
      });
      console.log(`✅ ${email} ya existía: ahora es SUPERADMIN (sin restaurante).`);
      console.log(envPassword ? '   Contraseña actualizada.' : '   Contraseña sin cambios.');
      return;
    }

    const password = envPassword ?? randomBytes(18).toString('base64url');
    await prisma.user.create({
      data: {
        email,
        name,
        password: await bcrypt.hash(password, BCRYPT_ROUNDS),
        role: Role.SUPERADMIN,
        restaurantId: null,
      },
    });
    console.log(`✅ SUPERADMIN creado: ${email}`);
    if (!envPassword) {
      console.log(`   Contraseña generada (guárdala, no se volverá a mostrar): ${password}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('❌', error instanceof Error ? error.message : error);
  process.exit(1);
});
