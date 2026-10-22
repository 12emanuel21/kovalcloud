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
  address?: string | null;
  businessHours?: BusinessHours | null;
  isTemporarilyClosed?: boolean;
  closedMessage?: string | null;
  extendedUntil?: string | null;
  theme?: string | null;
  categories: Category[];
}

/** Props comunes de todas las plantillas de la carta */
export interface MenuTemplateProps {
  restaurant: RestaurantData;
  categories: Category[];
  tableNumber?: string;
}
