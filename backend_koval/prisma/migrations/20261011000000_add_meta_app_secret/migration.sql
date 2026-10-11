-- BYOA: App Secret de Meta por restaurante (verificación de firma de webhooks).
-- Migración escrita a mano: la BD es compartida con Botpress, no usar el diff automático.
ALTER TABLE "Restaurant" ADD COLUMN "metaAppSecret" TEXT;
