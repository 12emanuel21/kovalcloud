import { PrismaClient } from '@prisma/client';

/**
 * Carga puntual del menú de Betania Express. Idempotente: reutiliza las categorías que ya existen
 * (mismo nombre, sin borrar) y no duplica platos con el mismo nombre en el restaurante.
 * No modifica platos ni categorías existentes.
 *
 *   node dist/scripts/seed-betania.js [--dry-run]
 */
const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const RESTAURANT_SLUG = 'betaniaexpress';
const OWNER_EMAIL = 'betaniaexpress@gmail.com';

type Dish = [name: string, price: number, description: string];

const MENU: Array<{ category: string; items: Dish[] }> = [
  {
    category: 'Perros y Hamburguesas',
    items: [
      ['Perro Súper Express', 6500, 'Sencillo y tradicional con papitas y salsas'],
      ['Perro Suizo', 13000, 'Salchicha suiza con queso y salsas de la casa'],
      ['Perro Caprichoso', 22000, 'Pollo, chorizo, jamón, butifarra, mozzarella, tocineta y salchicha'],
      ['Hamburguesa Doble Carne', 18000, 'Doble carne artesanal, queso mozzarella y vegetales'],
      ['Burger Patacón Especial', 21000, 'Patacón crocante con carne, pollo y queso gratinado'],
    ],
  },
  {
    category: 'Salchipapas y Desgranados',
    items: [
      ['Salchipapa Express', 14000, 'Papas a la francesa crocantes con salchicha y queso'],
      ['Salchi Trifásica', 19000, 'Salchicha, chorizo y butifarra tradicional'],
      ['Salchi Cantúa', 50000, '3 porciones de papa, salchicha, chorizo, butifarra, pollo, carne y salchicha suiza'],
      ['Desgranado Mixto', 23000, 'Maíz tierno desgranado, carne, pollo y queso costeño'],
      ['Desgranado Costilla BBQ', 31000, 'Costilla BBQ desmechada, mazorca, queso gratinado y papa francesa'],
    ],
  },
  {
    category: 'Mazorcas y Especiales',
    items: [
      ['Mazorca Trifásica', 21000, 'Mazorca desgranada con pollo, carne, butifarra y tártara'],
      ['Costillas BBQ con Francesa', 23000, 'Porción de costillas bañadas en BBQ con papas y ensalada'],
    ],
  },
  {
    category: 'Pizzas Seleccionadas',
    items: [
      ['Pizza Hawaiana (Personal)', 19000, 'Jamón, piña caramelizada y extra queso mozzarella'],
      ['Pizza Cuatro Carnes (Mediana)', 39000, 'Pollo, jamón seleccionado, salami y pepperoni'],
      ['Pizza Caprichos de Naylu (Familiar XL)', 63000, 'Pollo, pepperoni, salami, jamón, chorizo, butifarra y vegetales'],
    ],
  },
  {
    category: 'Bebidas y Jugos',
    items: [
      ['Limonada Cerezada (Vaso)', 10000, 'Limonada natural frapeada con cerezas'],
      ['Jugo Natural de Corozo', 8000, 'Jugo tradicional costeño bien frío'],
    ],
  },
];

const normalize = (value: string) => value.trim().toLocaleLowerCase('es');
const cop = (value: number) => `$${value.toLocaleString('es-CO')}`;

async function findRestaurant() {
  const bySlug = await prisma.restaurant.findFirst({
    where: { OR: [{ slug: RESTAURANT_SLUG }, { subdomain: RESTAURANT_SLUG }] },
    select: { id: true, name: true, slug: true },
  });
  if (bySlug) return { restaurant: bySlug, via: `slug/subdominio "${RESTAURANT_SLUG}"` };

  // El restaurante no guarda email: se busca por la cuenta de su dueño
  const owner = await prisma.user.findUnique({
    where: { email: OWNER_EMAIL },
    select: { restaurant: { select: { id: true, name: true, slug: true } } },
  });
  if (owner?.restaurant) return { restaurant: owner.restaurant, via: `email del dueño ${OWNER_EMAIL}` };
  return null;
}

async function main() {
  console.log(`🍔 Menú de Betania Express${DRY_RUN ? ' (SIMULACIÓN: no se escribe nada)' : ''}\n`);

  const found = await findRestaurant();
  if (!found) {
    throw new Error(`No se encontró el restaurante (slug/subdominio "${RESTAURANT_SLUG}" ni dueño ${OWNER_EMAIL})`);
  }
  const { restaurant, via } = found;
  console.log(`Restaurante: ${restaurant.name} (slug ${restaurant.slug}, id ${restaurant.id}) — encontrado por ${via}\n`);

  const [existingCategories, existingItems] = await Promise.all([
    prisma.menuCategory.findMany({
      where: { restaurantId: restaurant.id, deletedAt: null },
      select: { id: true, name: true, order: true },
    }),
    prisma.menuItem.findMany({
      where: { restaurantId: restaurant.id, deletedAt: null },
      select: { name: true },
    }),
  ]);
  const categoryByName = new Map(existingCategories.map((c) => [normalize(c.name), c]));
  const itemNames = new Set(existingItems.map((i) => normalize(i.name)));
  let nextOrder = existingCategories.reduce((max, c) => Math.max(max, c.order), -1) + 1;

  const summary = { categoriesCreated: 0, categoriesReused: 0, itemsCreated: 0, itemsSkipped: 0 };

  await prisma.$transaction(async (tx) => {
    for (const section of MENU) {
      let category = categoryByName.get(normalize(section.category));
      if (category) {
        summary.categoriesReused++;
        console.log(`📂 ${section.category} — ya existía, se reutiliza`);
      } else {
        summary.categoriesCreated++;
        category = DRY_RUN
          ? { id: '(nueva)', name: section.category, order: nextOrder }
          : await tx.menuCategory.create({
              data: { name: section.category, order: nextOrder, restaurantId: restaurant.id },
              select: { id: true, name: true, order: true },
            });
        nextOrder++;
        console.log(`📂 ${section.category} — CREADA (orden ${category.order})`);
      }

      for (const [name, price, description] of section.items) {
        if (itemNames.has(normalize(name))) {
          summary.itemsSkipped++;
          console.log(`   ↷ ${name} — ya existía, no se duplica`);
          continue;
        }
        if (!DRY_RUN) {
          await tx.menuItem.create({
            data: { name, price, description, isAvailable: true, restaurantId: restaurant.id, categoryId: category.id },
          });
        }
        itemNames.add(normalize(name));
        summary.itemsCreated++;
        console.log(`   ✓ ${name} — ${cop(price)}`);
      }
    }
  });

  console.log(
    `\n${DRY_RUN ? 'Se crearían' : 'Listo'}: ${summary.categoriesCreated} categorías nuevas, ` +
      `${summary.categoriesReused} reutilizadas, ${summary.itemsCreated} platos nuevos, ` +
      `${summary.itemsSkipped} omitidos por existir.`,
  );
}

main()
  .catch((error) => {
    console.error('❌', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
