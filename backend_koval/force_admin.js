const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  const email = 'admin@kovalcloud.com';
  const pass = 'KovalPassword2026!';
  
  const hash = await bcrypt.hash(pass, 10);

  await prisma.user.upsert({
    where: { email: email },
    update: { 
      password: hash,
      role: 'SUPERADMIN' 
    },
    create: { 
      email: email, 
      password: hash, 
      role: 'SUPERADMIN' 
    }
  });

  console.log('✅ ¡Usuario reseteado y forzado con éxito!');
  console.log(`📧 Correo: ${email}`);
  console.log(`🔑 Contraseña: ${pass}`);
}

main()
  .catch(e => {
    console.error('Error fatal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
