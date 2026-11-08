'use client';

import { useSyncExternalStore } from 'react';
import { isMobileDevice } from './whatsapp';

const noopSubscribe = () => () => {};

/**
 * isMobileDevice() apto para componentes renderizados en servidor: en el servidor (y durante la
 * hidratación) devuelve true, de modo que el enlace inicial sea api.whatsapp.com (funciona en
 * cualquier equipo); ya en el navegador se ajusta al dispositivo real sin desajustes de hidratación.
 */
export function useIsMobileDevice(): boolean {
  return useSyncExternalStore(noopSubscribe, isMobileDevice, () => true);
}
