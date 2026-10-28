-- Modo (claro / oscuro) con el que abre la carta pública. Se conserva el aspecto actual:
-- Café & Bakery (antes clean-light) abría en claro; el resto, en oscuro.
ALTER TABLE "Restaurant" ADD COLUMN "menuColorMode" TEXT NOT NULL DEFAULT 'dark';

UPDATE "Restaurant" SET "menuColorMode" = 'light' WHERE "theme" IN ('cafe-bakery', 'clean-light');
