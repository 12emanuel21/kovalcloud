'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ExternalLink, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getNavItems, isNavItemActive } from './navigation';
import { homePathForRole } from '@/lib/roles';

interface SidebarProps {
  /** Solo móvil: el sidebar se muestra como panel deslizante */
  mobileOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { restaurant, restaurantId, user, isImpersonating } = useAuth();
  const navItems = getNavItems(restaurantId, user?.role);
  // En Modo Dios el logo lleva al dashboard del local operado, no al panel /admin
  const homeHref = isImpersonating ? '/dashboard' : homePathForRole(user?.role);
  const restaurantSlug = restaurant?.slug;

  return (
    <>
      {/* Fondo oscuro detrás del panel en móvil */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950 transition-transform duration-200 md:static md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Marca */}
        <div className="flex h-16 items-center justify-between border-b border-slate-800 px-5">
          <Link href={homeHref} className="flex items-center gap-2.5" onClick={onClose}>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/20">
              K
            </span>
            <span className="text-lg font-black tracking-tight text-white">
              Koval<span className="text-emerald-400">Cloud</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 md:hidden"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navegación */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Principal
          </p>
          {navItems.map(({ label, href, icon: Icon, external }) => {
            const active = !external && isNavItemActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                aria-current={active ? 'page' : undefined}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                <span className="flex-1">{label}</span>
                {external && (
                  <ExternalLink className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-400" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Acceso rápido al menú público del restaurante */}
        {restaurantSlug && (
          <div className="border-t border-slate-800 p-3">
            <Link
              href={`/menu/${restaurantSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between rounded-lg px-3 py-2.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-900 hover:text-emerald-400"
            >
              <span>Ver menú digital</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}
