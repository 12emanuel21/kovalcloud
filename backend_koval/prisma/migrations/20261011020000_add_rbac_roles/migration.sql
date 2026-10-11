-- Fase 3 · RBAC: Role { SUPERADMIN OWNER KITCHEN }
-- Escrita a mano (BD compartida con Botpress): solo toca el enum "Role" y la tabla "User".
-- RENAME VALUE conserva el rol de los usuarios existentes sin recrear el tipo.

ALTER TYPE "Role" RENAME VALUE 'SUPER_ADMIN' TO 'SUPERADMIN';
ALTER TYPE "Role" RENAME VALUE 'RESTAURANT_OWNER' TO 'OWNER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'KITCHEN';

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'OWNER';

-- "name" pasa a ser obligatorio: se rellena con la parte local del email donde falte
UPDATE "User" SET "name" = split_part("email", '@', 1) WHERE "name" IS NULL OR btrim("name") = '';
ALTER TABLE "User" ALTER COLUMN "name" SET NOT NULL;
