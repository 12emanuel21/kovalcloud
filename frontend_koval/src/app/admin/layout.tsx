'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, LifeBuoy, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { homePathForRole } from '@/lib/roles';

const ADMIN_TABS = [
  { label: 'Restaurantes', href: '/admin', icon: Building2 },
  { label: 'Soporte Global', href: '/admin/tickets', icon: LifeBuoy },
];

const isTabActive = (pathname: string, href: string) =>
  href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);

/**
 * Zona global de plataforma: solo SUPERADMIN. Layout propio, sin el sidebar de restaurante.
 * (Protección de UX: el backend ya restringe a SUPERADMIN los endpoints globales.)
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, syncAuth, user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isSuperAdmin = user?.role === 'SUPERADMIN';

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      const synced = syncAuth ? syncAuth() : false;
      if (!synced) router.replace('/login');
    } else if (!isSuperAdmin) {
      router.replace(homePathForRole(user?.role));
    }
  }, [isAuthenticated, isLoading, isSuperAdmin, router, syncAuth, user?.role]);

  if (isLoading || !isAuthenticated || !isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
          <p className="text-xs font-semibold text-zinc-400">Verificando permisos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
          <Link href="/admin" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500 text-sm font-black text-white shadow-lg shadow-violet-500/20">
              K
            </span>
            <span className="text-lg font-black tracking-tight text-white">
              Koval<span className="text-violet-400">Cloud</span>
            </span>
            <span className="hidden items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-300 sm:inline-flex">
              <ShieldCheck className="h-3.5 w-3.5" />
              SuperAdmin
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden max-w-[240px] truncate text-sm text-zinc-400 sm:block" title={user?.email}>
              {user?.email}
            </span>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Cerrar Sesión</span>
            </button>
          </div>
        </div>

        <nav aria-label="Secciones del panel" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 md:px-6">
          {ADMIN_TABS.map(({ label, href, icon: Icon }) => {
            const active = isTabActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-violet-400 text-white'
                    : 'border-transparent text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">{children}</main>
    </div>
  );
}
