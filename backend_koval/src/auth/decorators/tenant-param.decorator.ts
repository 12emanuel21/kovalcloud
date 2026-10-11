import { SetMetadata } from '@nestjs/common';

export const TENANT_PARAM_KEY = 'tenantParam';

/**
 * Indica a TenantGuard qué parámetro de ruta contiene el id del restaurante.
 * Ej: @TenantParam('id') en /restaurants/:id.
 * Sin decorador, TenantGuard busca `restaurantId` en params, query y body.
 */
export const TenantParam = (paramName: string) => SetMetadata(TENANT_PARAM_KEY, paramName);
