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
  /** Pública por diseño (checkout de Wompi); los secretos nunca llegan a la carta */
  wompiPublicKey?: string | null;
  /** El backend confirma que el local puede cobrar en línea (llaves completas) */
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
