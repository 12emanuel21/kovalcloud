'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { homePathForRole, type UserRole } from '@/lib/roles';

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  planId?: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  restaurant?: Restaurant | null;
}

/** Restaurante que opera un SUPERADMIN en "Modo Dios" */
export type ImpersonatedRestaurant = Pick<Restaurant, 'id' | 'name' | 'slug'>;

interface AuthContextType {
  user: User | null;
  token: string | null;
  /** Restaurante en contexto: el del usuario o, en Modo Dios, el que opera el SUPERADMIN */
  restaurant: Restaurant | null;
  /** Id del restaurante en contexto ('' si no hay ninguno) */
  restaurantId: string;
  /** Restaurante que opera el SUPERADMIN (null si no está en Modo Dios) */
  impersonatedRestaurant: ImpersonatedRestaurant | null;
  isImpersonating: boolean;
  enterAsOwner: (restaurant: ImpersonatedRestaurant) => void;
  exitImpersonation: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  syncAuth: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = typeof window !== "undefined" ? "/api" : "http://koval_backend:4000";

// Modo Dios en sessionStorage: sobrevive a recargas pero muere al cerrar la pestaña,
// para que un SUPERADMIN no quede operando un local por olvido.
const IMPERSONATION_KEY = 'koval_impersonation';

function readImpersonation(): ImpersonatedRestaurant | null {
  try {
    const raw = sessionStorage.getItem(IMPERSONATION_KEY);
    const value = raw ? (JSON.parse(raw) as Partial<ImpersonatedRestaurant>) : null;
    return value?.id && value.name && value.slug ? { id: value.id, name: value.name, slug: value.slug } : null;
  } catch {
    return null;
  }
}

function clearImpersonationStorage() {
  try {
    sessionStorage.removeItem(IMPERSONATION_KEY);
  } catch {
    // sessionStorage no disponible (modo privado estricto): no hay nada que limpiar
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [impersonation, setImpersonation] = useState<ImpersonatedRestaurant | null>(null);

  const syncAuth = useCallback((): boolean => {
    try {
      if (typeof window === 'undefined') return false;
      const savedToken = localStorage.getItem('koval_token');
      const savedUser = localStorage.getItem('koval_user');

      if (savedToken && savedToken !== 'undefined' && savedToken !== 'null' && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        return true;
      } else {
        if (savedToken === 'undefined' || savedToken === 'null') {
          localStorage.removeItem('koval_token');
        }
        return false;
      }
    } catch (e) {
      console.error('Error al sincronizar sesión:', e);
      return false;
    }
  }, []);

  // Cargar sesión guardada (y Modo Dios activo) al montar, antes de que los layouts decidan
  useEffect(() => {
    syncAuth();
    setImpersonation(readImpersonation());
    setIsLoading(false);
  }, [syncAuth]);

  // El rol guardado puede estar desactualizado (cambio de rol, renombre de roles):
  // se refresca una vez desde el backend, que es la fuente de verdad.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`${API_URL}/auth/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((freshUser: User) => {
        if (cancelled || !freshUser?.role) return;
        setUser(freshUser);
        localStorage.setItem('koval_user', JSON.stringify(freshUser));
      })
      .catch((status) => {
        // Token caducado o usuario eliminado: cerrar la sesión local
        if (!cancelled && status === 401) {
          setToken(null);
          setUser(null);
          localStorage.removeItem('koval_token');
          localStorage.removeItem('koval_user');
          router.push('/login');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || 'Credenciales incorrectas (correo o contraseña inválidos)');
    }

    const data = await res.json();
    const accessToken = data.accessToken || data.access_token;
    const authUser = data.user;

    setToken(accessToken);
    setUser(authUser);
    setImpersonation(null);
    clearImpersonationStorage();

    localStorage.setItem('koval_token', accessToken);
    localStorage.setItem('koval_user', JSON.stringify(authUser));

    // Cada rol aterriza en su zona: SUPERADMIN -> /admin, KITCHEN -> pedidos, OWNER -> dashboard
    router.push(homePathForRole(authUser?.role));
  };

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setImpersonation(null);
    clearImpersonationStorage();
    localStorage.removeItem('koval_token');
    localStorage.removeItem('koval_user');
    router.push('/login');
  }, [router]);

  const enterAsOwner = useCallback((target: ImpersonatedRestaurant) => {
    const value = { id: target.id, name: target.name, slug: target.slug };
    setImpersonation(value);
    try {
      sessionStorage.setItem(IMPERSONATION_KEY, JSON.stringify(value));
    } catch {
      // Sin sessionStorage el Modo Dios dura solo hasta recargar
    }
  }, []);

  const exitImpersonation = useCallback(() => {
    setImpersonation(null);
    clearImpersonationStorage();
    router.push('/admin');
  }, [router]);

  // El disfraz solo aplica a un SUPERADMIN: cualquier otro rol usa siempre su propio restaurante
  const impersonatedRestaurant = user?.role === 'SUPERADMIN' ? impersonation : null;
  const restaurant: Restaurant | null = impersonatedRestaurant ?? user?.restaurant ?? null;
  // Sin respaldo: un usuario sin restaurante no debe operar ningún local por accidente
  const restaurantId = restaurant?.id ?? '';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        restaurant,
        restaurantId,
        impersonatedRestaurant,
        isImpersonating: impersonatedRestaurant !== null,
        enterAsOwner,
        exitImpersonation,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        logout,
        syncAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
};
