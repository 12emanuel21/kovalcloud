import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 10;
const isBcryptHash = (value: string) => /^\$2[aby]\$\d{2}\$/.test(value);

async function main() {
  console.log('🌱 Iniciando seed...');

  // 1. Planes
  const planCloud = await prisma.plan.upsert({
    where: { id: 'plan-cloud-base' },
    update: {},
    create: {
      id: 'plan-cloud-base',
      name: 'Koval Cloud (Restaurantes)',
      price: 0, // Gratis inicial / setup cobrado
    },
  });

  await prisma.plan.upsert({
    where: { id: 'plan-on-premise' },
    update: {},
    create: {
      id: 'plan-on-premise',
      name: 'Koval Enterprise On-Premise',
      price: 2000000,
    },
  });

  // 2. Super Admin maestro
  //    Credenciales desde variables de entorno. Si el usuario ya existe y no se
  //    pasa SUPER_ADMIN_PASSWORD, se conserva su contraseña actual.
  const adminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@kovalcloud.com').toLowerCase().trim();
  const envPassword = process.env.SUPER_ADMIN_PASSWORD;
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  let generatedPassword: string | null = null;
  let adminPasswordHash: string | undefined;
  if (envPassword) {
    adminPasswordHash = await bcrypt.hash(envPassword, BCRYPT_ROUNDS);
  } else if (!existingAdmin) {
    generatedPassword = randomBytes(12).toString('base64url');
    adminPasswordHash = await bcrypt.hash(generatedPassword, BCRYPT_ROUNDS);
  }

  const adminUser = existingAdmin
    ? await prisma.user.update({
        where: { id: existingAdmin.id },
        data: {
          role: Role.SUPERADMIN,
          restaurantId: null,
          ...(adminPasswordHash && { password: adminPasswordHash }),
        },
      })
    : await prisma.user.create({
        data: {
          email: adminEmail,
          name: 'Super Admin',
          password: adminPasswordHash!,
          role: Role.SUPERADMIN,
        },
      });

  // 3. Re-hashear contraseñas antiguas guardadas en texto plano
  const usersToRehash = (await prisma.user.findMany({ select: { id: true, email: true, password: true } }))
    .filter((u) => !isBcryptHash(u.password));
  for (const u of usersToRehash) {
    await prisma.user.update({
      where: { id: u.id },
      data: { password: await bcrypt.hash(u.password, BCRYPT_ROUNDS) },
    });
    console.log(`🔐 Contraseña en texto plano encriptada para ${u.email}`);
  }

  // 4. Restaurante de prueba con su subdominio y su dueño asociado
  const testOwner = await prisma.user.upsert({
    where: { email: 'dueno@napoles.com' },
    update: {},
    create: {
      email: 'dueno@napoles.com',
      name: 'Dueño Pizzería Nápoles',
      password: await bcrypt.hash(randomBytes(12).toString('base64url'), BCRYPT_ROUNDS),
      role: Role.OWNER,
    },
  });

  const testRestaurant = await prisma.restaurant.upsert({
    where: { slug: 'pizzeria-napoles' },
    update: {},
    create: {
      name: 'Pizzería Nápoles',
      slug: 'pizzeria-napoles',
      subdomain: 'pizzeria-napoles',
      planId: planCloud.id,
    },
  });

  await prisma.user.update({
    where: { id: testOwner.id },
    data: { restaurantId: testRestaurant.id },
  });

  console.log('✅ Seed completado con éxito:');
  console.log(`   Super Admin: ${adminUser.email} (${adminUser.role})`);
  if (generatedPassword) {
    console.log(`   ⚠️  Contraseña generada (guárdala, no se volverá a mostrar): ${generatedPassword}`);
  } else if (envPassword) {
    console.log('   Contraseña: la indicada en SUPER_ADMIN_PASSWORD');
  } else {
    console.log('   Contraseña: sin cambios (usa SUPER_ADMIN_PASSWORD para cambiarla)');
  }
  console.log(`   Restaurante de prueba: ${testRestaurant.name} -> ${testRestaurant.subdomain} (dueño: ${testOwner.email})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
