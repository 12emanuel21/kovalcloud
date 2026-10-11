-- Borrado lógico de categorías y platos (conserva el historial de pedidos).
-- Migración escrita a mano: la BD es compartida con Botpress, no usar el diff automático.
ALTER TABLE "MenuCategory" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "MenuItem" ADD COLUMN "deletedAt" TIMESTAMP(3);
