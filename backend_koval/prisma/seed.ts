import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // 1. Crear o asegurar Planes
  const planCloud = await prisma.plan.upsert({
    where: { id: 'plan-cloud-base' },
    update: {},
    create: {
      id: 'plan-cloud-base',
      name: 'Koval Cloud (Restaurantes)',
      price: 0, // Gratis inicial / setup cobrado
    },
  });

  const planOnPremise = await prisma.plan.upsert({
    where: { id: 'plan-on-premise' },
    update: {},
    create: {
      id: 'plan-on-premise',
      name: 'Koval Enterprise On-Premise',
      price: 2000000,
    },
  });

  // 2. Crear SuperAdmin inicial
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@kovalcloud.com' },
    update: {},
    create: {
      email: 'admin@kovalcloud.com',
      password: 'admin_password_segura', // Luego agregaremos bcrypt para encriptar
      role: Role.SUPERADMIN,
    },
  });

  console.log('✅ Seed completado con éxito:');
  console.log({ planCloud, planOnPremise, adminUser });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
