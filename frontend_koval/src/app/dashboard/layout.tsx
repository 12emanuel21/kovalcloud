'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import { canAccessDashboardPath, homePathForRole } from '@/lib/roles';
import { Loader2 } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import { SudoProvider } from '@/context/SudoContext';
import { ThemeProvider } from '@/components/theme/ThemeProvider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Tema claro/oscuro del panel; .koval-dashboard delimita el modo claro de globals.css
  return (
    <ThemeProvider>
      <div className="koval-dashboard">
        <DashboardShell>{children}</DashboardShell>
      </div>
    </ThemeProvider>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, syncAuth, user, isImpersonating } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // RBAC de rutas: SUPERADMIN solo en Modo Dios; KITCHEN solo Pedidos
  const allowedHere = !user || canAccessDashboardPath(user.role, pathname, isImpersonating);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        const synced = syncAuth ? syncAuth() : false;
        if (!synced) {
          router.push('/login');
        }
      } else if (!allowedHere) {
        router.replace(homePathForRole(user?.role));
      }
    }
  }, [isAuthenticated, isLoading, router, syncAuth, allowedHere, user?.role]);

  const hasLocalSession = typeof window !== 'undefined' && Boolean(localStorage.getItem('koval_token'));

  // Pantalla de carga mientras se verifica la sesión, se sincroniza desde localStorage o se redirige por rol
  if (isLoading || (!isAuthenticated && hasLocalSession) || (isAuthenticated && !allowedHere)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/20">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
          </div>
          <p className="text-xs font-semibold text-gray-500 dark:text-slate-400">Verificando credenciales...</p>
        </div>
      </div>
    );
  }

  // Si no está autenticado y no hay token en localStorage, no renderizar el contenido mientras redirige
  if (!isAuthenticated) {
    return null;
  }

  return (
    // Sudo Mode: modal de código 2FA para guardar configuraciones sensibles
    <SudoProvider>
    <div className="flex h-screen bg-gray-50 text-gray-900 antialiased selection:bg-emerald-500 selection:text-white dark:bg-[#0f172a] dark:text-slate-100">
      <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar onMenuClick={() => setMobileSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
    </SudoProvider>
  );
}
