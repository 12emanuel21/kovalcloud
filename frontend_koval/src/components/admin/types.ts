import type { UserRole } from '@/lib/roles';

export interface TenantUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

/** Restaurante tal como lo devuelve GET /admin/restaurants */
export interface AdminRestaurant {
  id: string;
  name: string;
  slug: string;
  subdomain: string;
  createdAt: string;
  owner: TenantUser | null;
  users: TenantUser[];
  plan?: { id: string; name: string } | null;
}
