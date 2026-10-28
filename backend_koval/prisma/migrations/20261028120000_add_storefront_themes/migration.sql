-- La columna "theme" ya existe (20261022100423_add_restaurant_theme). Esta migración pasa a los
-- 4 temas nuevos: cambia el valor por defecto y convierte los temas de la primera versión.
ALTER TABLE "Restaurant" ALTER COLUMN "theme" SET DEFAULT 'street-burger';

UPDATE "Restaurant" SET "theme" = 'street-burger' WHERE "theme" = 'dark-premium';
UPDATE "Restaurant" SET "theme" = 'cafe-bakery' WHERE "theme" = 'clean-light';
UPDATE "Restaurant" SET "theme" = 'street-burger'
WHERE "theme" NOT IN ('street-burger', 'cafe-bakery', 'sushi-dark', 'bistro-grill');
