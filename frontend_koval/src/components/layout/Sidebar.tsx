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
          className="fixed inset-0 z-30 bg-gray-900/40 backdrop-blur-sm md:hidden dark:bg-slate-950/70"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-950 duration-200 md:static md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Marca */}
        <div className="flex h-16 items-center justify-between border-b border-gray-200 px-5 dark:border-slate-800">
          <Link href={homeHref} className="flex items-center gap-2.5" onClick={onClose}>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/20">
              K
            </span>
            <span className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
              Koval<span className="text-emerald-600 dark:text-emerald-400">Cloud</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 md:hidden dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navegación */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
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
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                <span className="flex-1">{label}</span>
                {external && (
                  <ExternalLink className="h-3.5 w-3.5 text-gray-400 group-hover:text-gray-600 dark:text-slate-600 dark:group-hover:text-slate-400" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Acceso rápido al menú público del restaurante */}
        {restaurantSlug && (
          <div className="border-t border-gray-200 p-3 dark:border-slate-800">
            <Link
              href={`/menu/${restaurantSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between rounded-lg px-3 py-2.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-emerald-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-emerald-400"
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
