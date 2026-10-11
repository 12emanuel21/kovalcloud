'use client';

import { usePathname } from 'next/navigation';
import { LogOut, Menu } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getPageTitle } from './navigation';

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
  const { user, restaurant, logout } = useAuth();

  const email = user?.email ?? '';
  const isSuperAdmin = user?.role === 'SUPERADMIN';
  const subtitle = restaurant?.name
    ? `Bienvenido de nuevo · ${restaurant.name}`
    : 'Bienvenido de nuevo';

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-800 bg-slate-900 px-4 md:px-6">
      {/* Izquierda: sección actual */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 md:hidden"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-white">{getPageTitle(pathname)}</h1>
          <p className="hidden truncate text-xs text-slate-400 sm:block">{subtitle}</p>
        </div>
      </div>

      {/* Derecha: usuario y cerrar sesión */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="max-w-[220px] truncate text-sm font-medium text-slate-200" title={email}>
            {email}
          </p>
          <p className="text-[11px] font-medium text-slate-500">
            {isSuperAdmin ? 'Super Admin' : 'Propietario'}
          </p>
        </div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-xs font-bold text-emerald-400"
          title={email}
        >
          {getInitials(email)}
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Cerrar Sesión</span>
        </button>
      </div>
    </header>
  );
}
