const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const restaurantId = '8a23ecc8-788f-43fd-a5d6-d3f83ab5316d';
  
  const reply = await prisma.autoReply.create({
    data: {
      restaurantId: restaurantId,
      triggerWords: ['hola', 'holas', 'buenas', 'menu', 'menú', 'catálogo'],
      responseType: 'DYNAMIC_MENU',
      isActive: true
    }
  });
  console.log('✅ Interceptor activado en BD. Registro:', reply);
}

main()
  .catch(e => console.error('❌ Error:', e))
  .finally(async () => await prisma.$disconnect());
