'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

const API_URL = typeof window !== 'undefined' ? '/api' : 'http://koval_backend:4000';

interface Employee {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
}

/** Mensaje legible de un error de la API (ValidationPipe devuelve message como arreglo) */
async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const message = Array.isArray(data.message) ? data.message.join('. ') : data.message;
  return message || fallback;
}

/**
 * Equipo del local: cuentas de cocina (KITCHEN).
 * El dueño las crea y revoca su acceso en un clic; el backend corta sesiones y
 * WebSockets abiertos al instante.
 */
export function TeamSection() {
  const { token, restaurantId } = useAuth();
  // Restaurante en contexto (propio o, en Modo Dios, el operado): sin él un SUPERADMIN
  // listaría empleados de todos los locales y no podría crear cuentas
  const tenantQuery = restaurantId ? `?restaurantId=${encodeURIComponent(restaurantId)}` : '';

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const authHeaders = useCallback(
    (): Record<string, string> => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token],
  );

  // Carga inicial: setState solo en callbacks de la promesa (nunca síncrono en el efecto)
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`${API_URL}/users${tenantQuery}`, { cache: 'no-store', headers: authHeaders() })
      .then(async (res) => {
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo cargar el equipo'));
        return res.json() as Promise<Employee[]>;
      })
      .then((data) => {
        if (!cancelled) setEmployees(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar el equipo');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, authHeaders, tenantQuery]);

  // Cambio optimista: se revierte si la API lo rechaza
  const handleToggle = async (employee: Employee) => {
    const nextActive = !employee.isActive;
    setTogglingId(employee.id);
    setEmployees((prev) => prev.map((e) => (e.id === employee.id ? { ...e, isActive: nextActive } : e)));
    try {
      const res = await fetch(`${API_URL}/users/${employee.id}/status`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ isActive: nextActive }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo actualizar el acceso'));
      setError(null);
    } catch (err) {
      setEmployees((prev) => prev.map((e) => (e.id === employee.id ? { ...e, isActive: employee.isActive } : e)));
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el acceso');
    } finally {
      setTogglingId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: authHeaders(),
        // El backend toma restaurantId del body en POST /users (CreateEmployeeDto)
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim(),
          password: newPassword,
          ...(restaurantId ? { restaurantId } : {}),
        }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'No se pudo crear el empleado'));
      const created: Employee = await res.json();
      setEmployees((prev) => [...prev, created]);
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setShowForm(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el empleado');
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-6 shadow-sm shadow-black/20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-sm border border-blue-500/20">
            👥
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Equipo de Cocina</h2>
            <p className="text-xs text-slate-400">
              Cuentas del personal de cocina: ven el Kanban de pedidos y el monitor KDS, sin datos financieros.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-blue-500/20 cursor-pointer self-start sm:self-auto"
        >
          <span>+ Crear Empleado</span>
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">{error}</div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="p-4 rounded-2xl bg-slate-950/80 border border-blue-500/30 space-y-4 animate-in fade-in duration-200"
        >
          <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider">Nueva cuenta de cocina</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Nombre</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej. Cocina Turno Noche"
                required
                maxLength={100}
                className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Correo</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="cocina@restaurante.com"
                required
                className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Contraseña inicial</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold text-xs transition cursor-pointer"
            >
              {creating ? 'Creando...' : 'Crear Cuenta'}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto border border-slate-800/80 rounded-2xl bg-slate-950/40">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900/60 border-b border-slate-800 text-slate-400">
            <tr>
              <th className="p-3.5 font-semibold">Nombre</th>
              <th className="p-3.5 font-semibold">Email</th>
              <th className="p-3.5 font-semibold text-right">Acceso al Sistema</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={3} className="p-6 text-center text-slate-500">
                  Cargando equipo...
                </td>
              </tr>
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-6 text-center text-slate-500">
                  Aún no hay cuentas de cocina. Crea la primera con “+ Crear Empleado”.
                </td>
              </tr>
            ) : (
              employees.map((employee) => (
                <tr key={employee.id} className="hover:bg-slate-900/40 transition">
                  <td className="p-3.5 font-medium text-white">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs uppercase ${
                          employee.isActive ? 'bg-slate-800 text-slate-300' : 'bg-slate-900 text-slate-600'
                        }`}
                      >
                        {employee.name.charAt(0)}
                      </div>
                      <span className={employee.isActive ? '' : 'text-slate-500'}>{employee.name}</span>
                    </div>
                  </td>
                  <td className="p-3.5 text-slate-400 font-mono text-[11px]">{employee.email}</td>
                  <td className="p-3.5">
                    <div className="flex items-center justify-end gap-2.5">
                      <span className={`text-[11px] font-semibold ${employee.isActive ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {employee.isActive ? 'Activo' : 'Revocado'}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={employee.isActive}
                        aria-label={`Acceso al sistema de ${employee.name}`}
                        onClick={() => handleToggle(employee)}
                        disabled={togglingId === employee.id}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition cursor-pointer disabled:opacity-60 disabled:cursor-wait ${
                          employee.isActive ? 'bg-emerald-500 border-emerald-400' : 'bg-slate-700 border-slate-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                            employee.isActive ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
