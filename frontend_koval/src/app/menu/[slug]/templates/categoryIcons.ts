import {
  Beef,
  Beer,
  CakeSlice,
  Coffee,
  Cookie,
  Croissant,
  CupSoda,
  Drumstick,
  Fish,
  Flame,
  Hamburger,
  IceCreamCone,
  Pizza,
  Popcorn,
  Salad,
  Sandwich,
  Soup,
  UtensilsCrossed,
  Wine,
  type LucideIcon,
} from 'lucide-react';

/** Palabra clave (sin tildes, minúsculas) -> icono. El primer acierto gana. */
const RULES: Array<[RegExp, LucideIcon]> = [
  [/pizza/, Pizza],
  [/hamburgues|burger/, Hamburger],
  [/perro|hot ?dog|sandw|sanduch|wrap|sub\b/, Sandwich],
  [/pollo|alita|chicken|wing|nugget/, Drumstick],
  [/carne|parrill|asad|steak|costill|ribs|\bres\b/, Beef],
  [/pescad|marisc|fish|sushi|ceviche/, Fish],
  [/ensalad|salad|veg/, Salad],
  [/sopa|soup|caldo|crema|pasta|lasa|spagh/, Soup],
  [/helad|ice ?cream|malteada|shake/, IceCreamCone],
  [/postre|dessert|torta|pastel|cake|dulce/, CakeSlice],
  [/galleta|cookie/, Cookie],
  [/desayun|panader|bakery|brunch/, Croissant],
  [/cafe|coffee|te\b|infusion/, Coffee],
  [/cerveza|beer/, Beer],
  [/vino|wine|coctel|cocktail|licor|trago/, Wine],
  [/bebida|jugo|gaseosa|refresco|drink|soda|limonada|agua/, CupSoda],
  [/entrada|acompa|papas|fries|snack|side|picad/, Popcorn],
  [/combo|promo|especial|oferta/, Flame],
];

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function getCategoryIcon(name: string): LucideIcon {
  const key = normalize(name);
  return RULES.find(([pattern]) => pattern.test(key))?.[1] ?? UtensilsCrossed;
}
