import type { MenuPalette } from '@/app/menu/[slug]/templates/palettes';
import type { Category, MenuItem } from '@/app/menu/[slug]/templates/types';

/**
 * Contrato de las plantillas estructurales (cómo se disponen los platos). La carcasa de la carta
 * (header, hero, horarios, carrito) es común; la plantilla decide la navegación por categorías y
 * el formato de cada plato. Los colores salen del tema activo (palette / clases sf-*).
 */
export interface MenuSectionProps {
  categories: Category[];
  /** Búsqueda compartida con el buscador del header (escritorio) */
  query: string;
  onQueryChange: (query: string) => void;
  palette: MenuPalette;
  isClosed: boolean;
  onAdd: (item: MenuItem) => void;
  getQuantity: (itemId: string) => number;
  isJustAdded: (itemId: string) => boolean;
  /** Platos más pedidos del último mes (badge "Popular") */
  popularItemIds: string[];
  /** Platos agregados hace poco (badge "Nuevo") */
  newItemIds: string[];
}
