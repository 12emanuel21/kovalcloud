
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@kovalcloud.com';
  const password = 'KovalPassword2026!';
  
  // Verificar si ya existe
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    console.log('El usuario superadmin ya existe. Usa: admin@kovalcloud.com / KovalPassword2026!');
    return;
  }

  // Encriptar contraseña y crear usuario
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name: 'Emanuel Vargas (Superadmin)',
      role: 'SUPERADMIN', // Asegúrate de que el enum en schema.prisma permita esto
    },
  });

  console.log('✅ Superadmin creado con éxito!');
  console.log('📧 Correo: ema0601vargas@gmail.com');
  console.log('🔑 Contraseña: 301245243912Nele21!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
