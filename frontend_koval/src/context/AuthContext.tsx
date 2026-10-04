'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  planId?: string;
}

export interface User {
  id: string;
  email: string;
  role: 'SUPERADMIN' | 'RESTAURANT_OWNER';
  restaurant?: Restaurant | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  restaurant: Restaurant | null;
  restaurantId: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  syncAuth: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = typeof window !== "undefined" ? "/api" : "http://koval_backend:4000";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

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

  // Cargar sesión guardada en localStorage al montar
  useEffect(() => {
    syncAuth();
    setIsLoading(false);
  }, [syncAuth]);

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

    localStorage.setItem('koval_token', accessToken);
    localStorage.setItem('koval_user', JSON.stringify(authUser));

    router.push('/dashboard');
  };

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('koval_token');
    localStorage.removeItem('koval_user');
    router.push('/login');
  }, [router]);

  const restaurant = user?.restaurant || null;
  // Si el usuario autenticado tiene restaurante, se usa su id; de lo contrario, ID de respaldo
  const restaurantId = restaurant?.id || '8a23ecc8-788f-43fd-a5d6-d3f83ab5316d';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        restaurant,
        restaurantId,
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
