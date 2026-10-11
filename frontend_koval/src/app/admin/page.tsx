'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Building2, CircleAlert, ExternalLink, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import NewRestaurantModal from '@/components/admin/NewRestaurantModal';
import type { AdminRestaurant } from '@/components/admin/types';

const API_URL = '/api';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

export default function AdminHomePage() {
  const { token } = useAuth();
  const [restaurants, setRestaurants] = useState<AdminRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  const loadRestaurants = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/restaurants`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`No se pudieron cargar los restaurantes (${res.status})`);
      setRestaurants(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar los restaurantes');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos remotos
    loadRestaurants();
  }, [loadRestaurants]);

  const handleCreated = (created: AdminRestaurant) => {
    setModalOpen(false);
    setJustCreatedId(created.id);
    loadRestaurants();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white md:text-3xl">Restaurantes</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Clientes de KovalCloud y sus dueños. {restaurants.length > 0 && `${restaurants.length} en total.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadRestaurants}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2.5 text-sm text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
            aria-label="Recargar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-500"
          >
            <Plus className="h-4 w-4" />
            Nuevo Restaurante
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          <CircleAlert className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Nombre del Restaurante</th>
                <th className="px-5 py-3 font-semibold">Subdominio / Slug</th>
                <th className="px-5 py-3 font-semibold">Email del Dueño</th>
                <th className="px-5 py-3 font-semibold">Fecha de Creación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {loading && restaurants.length === 0 ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 4 }).map((__, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-800" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : restaurants.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-14 text-center">
                    <Building2 className="mx-auto h-8 w-8 text-zinc-600" />
                    <p className="mt-2 text-sm text-zinc-400">Aún no hay restaurantes. Crea el primero.</p>
                  </td>
                </tr>
              ) : (
                restaurants.map((r) => (
                  <tr
                    key={r.id}
                    className={`transition-colors hover:bg-zinc-800/40 ${justCreatedId === r.id ? 'bg-violet-500/10' : ''}`}
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-white">{r.name}</p>
                      {r.plan?.name && <p className="text-xs text-zinc-500">{r.plan.name}</p>}
                    </td>
                    <td className="px-5 py-4">
                      <a
                        href={`/menu/${r.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 font-mono text-xs text-violet-300 hover:text-violet-200"
                        title="Ver menú público"
                      >
                        {r.subdomain || r.slug}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                    <td className="px-5 py-4">
                      {r.owner ? (
                        <>
                          <p className="text-zinc-200">{r.owner.email}</p>
                          <p className="text-xs text-zinc-500">{r.owner.name}</p>
                        </>
                      ) : (
                        <span className="text-xs text-amber-400">Sin dueño asignado</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-zinc-400">{formatDate(r.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <NewRestaurantModal token={token} onClose={() => setModalOpen(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}
