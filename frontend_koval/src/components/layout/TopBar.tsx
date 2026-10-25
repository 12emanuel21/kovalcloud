'use client';

import { usePathname } from 'next/navigation';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getPageTitle } from './navigation';
import { ROLE_LABELS } from '@/lib/roles';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

interface TopBarProps {
  /** Solo móvil: abre el sidebar */
  onMenuClick?: () => void;
}

/** "dueno.napoles@x.com" -> "DN"; "admin@x.com" -> "AD" */
function getInitials(email: string): string {
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[._-]+/).filter(Boolean);
  const initials = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return initials.toUpperCase() || '?';
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const pathname = usePathname();
  const { user, restaurant, logout, impersonatedRestaurant, exitImpersonation } = useAuth();

  const email = user?.email ?? '';
  const roleLabel = user?.role ? ROLE_LABELS[user.role] ?? user.role : '';
  const subtitle = restaurant?.name
    ? `Bienvenido de nuevo · ${restaurant.name}`
    : 'Bienvenido de nuevo';

  return (
    <>
      {/* Modo Dios: un SUPERADMIN está operando el dashboard de un cliente */}
      {impersonatedRestaurant && (
        <div
          role="alert"
          className="flex shrink-0 items-center justify-between gap-3 border-b border-orange-400/40 bg-gradient-to-r from-rose-600 to-orange-500 px-4 py-2 text-white shadow-lg shadow-rose-950/40 md:px-6"
        >
          <p className="min-w-0 truncate text-xs font-semibold sm:text-sm">
            <span aria-hidden>⚠️ </span>
            <span className="font-black uppercase tracking-wide">Modo Dios:</span> Operando{' '}
            <span className="font-black">{impersonatedRestaurant.name}</span>
            <span className="hidden font-mono text-[11px] opacity-80 sm:inline"> ({impersonatedRestaurant.slug})</span>
          </p>
          <button
            type="button"
            onClick={exitImpersonation}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/40 bg-white/15 px-3 py-1 text-xs font-bold transition hover:bg-white/25"
          >
            <X className="h-3.5 w-3.5" />
            <span>Salir</span>
          </button>
        </div>
      )}

      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 md:px-6 dark:border-slate-800 dark:bg-[#0f172a]">
        {/* Izquierda: sección actual */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 md:hidden dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-gray-900 dark:text-white">{getPageTitle(pathname)}</h1>
            <p className="hidden truncate text-xs text-gray-500 sm:block dark:text-slate-400">{subtitle}</p>
          </div>
        </div>

        {/* Derecha: tema, usuario y cerrar sesión */}
        <div className="flex shrink-0 items-center gap-3">
          <ThemeToggle />
          <div className="hidden text-right sm:block">
            <p className="max-w-[220px] truncate text-sm font-medium text-gray-800 dark:text-slate-200" title={email}>
              {email}
            </p>
            <p className="text-[11px] font-medium text-gray-500 dark:text-slate-500">
              {roleLabel}
            </p>
          </div>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-xs font-bold text-emerald-700 dark:text-emerald-400"
            title={email}
          >
            {getInitials(email)}
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-600 dark:border-slate-700 dark:text-slate-300 dark:hover:text-rose-400"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Cerrar Sesión</span>
          </button>
        </div>
      </header>
    </>
  );
}
