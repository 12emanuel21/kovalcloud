-- Multi-tenant: usuarios pertenecen a un restaurante (1:N) y cada restaurante tiene subdominio.
-- Migración escrita a mano: la BD es compartida con Botpress, no usar el diff automático.

-- 1. Renombrar valor del enum Role (conserva los datos existentes)
ALTER TYPE "Role" RENAME VALUE 'SUPERADMIN' TO 'SUPER_ADMIN';

-- 2. Nuevas columnas en User
ALTER TABLE "User" ADD COLUMN "name" TEXT,
ADD COLUMN "restaurantId" TEXT;

-- 3. Migrar la relación existente Restaurant.ownerId -> User.restaurantId
UPDATE "User" u SET "restaurantId" = r."id"
FROM "Restaurant" r WHERE r."ownerId" = u."id";

-- 4. Eliminar la relación antigua 1:1
ALTER TABLE "Restaurant" DROP CONSTRAINT "Restaurant_ownerId_fkey";
DROP INDEX "Restaurant_ownerId_key";
ALTER TABLE "Restaurant" DROP COLUMN "ownerId";

-- 5. Subdominio: se inicializa con el slug actual y luego se vuelve obligatorio
ALTER TABLE "Restaurant" ADD COLUMN "subdomain" TEXT;
UPDATE "Restaurant" SET "subdomain" = "slug";
ALTER TABLE "Restaurant" ALTER COLUMN "subdomain" SET NOT NULL;

-- 6. Índices y FK
CREATE UNIQUE INDEX "Restaurant_subdomain_key" ON "Restaurant"("subdomain");
CREATE INDEX "User_restaurantId_idx" ON "User"("restaurantId");
ALTER TABLE "User" ADD CONSTRAINT "User_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
