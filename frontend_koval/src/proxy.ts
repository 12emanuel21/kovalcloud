import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getTenantSlugFromHost } from '@/lib/tenant';

/**
 * Multi-tenant por subdominio (Next 16: "proxy" es el nuevo nombre de "middleware").
 *
 * - Dominio principal (localhost, túnel, etc.): sin cambios -> landing + panel de administración.
 * - Subdominio de restaurante (pizzeria-napoles.localhost): se reescribe internamente
 *   a /menu/pizzeria-napoles. La URL del navegador no cambia.
 *
 * Nota: hoy el subdominio de un restaurante es igual a su slug (la migración de la
 * Fase 1 los inicializó iguales). Si algún día difieren, resolver por subdominio en el backend.
 */

/** Rutas que siempre van a la app normal, también desde un subdominio */
const APP_PREFIXES = ['/dashboard', '/login', '/kitchen', '/menu'];

export function proxy(request: NextRequest) {
  const slug = getTenantSlugFromHost(request.headers.get('host'));
  if (!slug) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (APP_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname === '/' ? `/menu/${slug}` : `/menu/${slug}${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Excluir API (nginx la envía al backend), assets de Next y archivos estáticos
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)'],
};
