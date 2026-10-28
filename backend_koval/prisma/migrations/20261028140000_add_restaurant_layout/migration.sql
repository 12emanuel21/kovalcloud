-- Estructura de la carta pública: visual-grid (tarjetas grandes) | compact-row (lista estilo delivery)
ALTER TABLE "Restaurant" ADD COLUMN "layout" TEXT NOT NULL DEFAULT 'visual-grid';
