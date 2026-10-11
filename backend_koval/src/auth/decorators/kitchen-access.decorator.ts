import { SetMetadata } from '@nestjs/common';

export const KITCHEN_ACCESS_KEY = 'kitchenAccess';

/**
 * Habilita el endpoint para el rol KITCHEN. Por defecto (sin este decorador),
 * JwtAuthGuard deniega a KITCHEN cualquier endpoint autenticado.
 */
export const KitchenAccess = () => SetMetadata(KITCHEN_ACCESS_KEY, true);
