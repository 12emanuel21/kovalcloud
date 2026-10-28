-- Marca propia en la carta pública: color de acento libre (HEX, null = el del tema) y tipografía
ALTER TABLE "Restaurant" ADD COLUMN "customColor" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN "fontFamily" TEXT NOT NULL DEFAULT 'sans-modern';
