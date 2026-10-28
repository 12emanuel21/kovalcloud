import type { BusinessHours } from '@/lib/business-hours';

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
}

export interface Category {
  id: string;
  name: string;
  order: number;
  items: MenuItem[];
}

export interface RestaurantData {
  id: string;
  name: string;
  slug: string;
  phone?: string;
  /** WhatsApp del local para wa.me (dígitos con indicativo, lo calcula el backend); null = sin teléfono */
  whatsappNumber?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  paymentDetails?: string | null;
  address?: string | null;
  businessHours?: BusinessHours | null;
  isTemporarilyClosed?: boolean;
  closedMessage?: string | null;
  extendedUntil?: string | null;
  theme?: string | null;
  /** Modo con el que abre la carta (elegido por el dueño); el cliente lo cambia con ☀️/🌙 */
  menuColorMode?: 'light' | 'dark' | null;
  /** Estructura de los platos: visual-grid (tarjetas) | compact-row (lista estilo delivery) | bistro-classic */
  layout?: string | null;
  /** Acento propio #RRGGBB (null = el del tema) */
  customColor?: string | null;
  /** Tipografía: sans-modern | street-urban | serif-elegant | warm-rounded */
  fontFamily?: string | null;
  /** Platos más pedidos del último mes (badge "Popular") */
  popularItemIds?: string[];
  /** Platos agregados hace poco (badge "Nuevo"); lo calcula el backend */
  newItemIds?: string[];
  /** Pública por diseño (checkout de Wompi); los secretos nunca llegan a la carta */
  wompiPublicKey?: string | null;
  /** Interruptor manual del dueño para encender o apagar la pasarela */
  isWompiEnabled?: boolean;
  /** El backend confirma que el local puede cobrar en línea (interruptor encendido + llaves completas) */
  onlinePaymentsEnabled?: boolean;
  categories: Category[];
}

/** Props comunes de todas las plantillas de la carta */
export interface MenuTemplateProps {
  restaurant: RestaurantData;
  categories: Category[];
  tableNumber?: string;
  /** Pedido con el que el cliente vuelve del checkout de Wompi (?pedido=) */
  returnedOrderId?: string;
}
