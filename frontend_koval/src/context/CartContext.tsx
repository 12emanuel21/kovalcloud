'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  removeItem: (id: string) => void;
  /** Quita varios platos de una vez (ej. los que el backend reporta agotados) */
  removeItems: (ids: string[]) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  totalCount: number;
  totalAmount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

/** Clave anterior, compartida por todos los locales (mezclaba carritos): se descarta */
const LEGACY_CART_KEY = 'koval_cart';

/**
 * Un carrito por restaurante: cada carta guarda el suyo en koval_cart_<restaurantId>,
 * así los platos de un local nunca llegan al pedido de otro.
 */
export const CartProvider: React.FC<{ restaurantId: string; children: React.ReactNode }> = ({ restaurantId, children }) => {
  const storageKey = `koval_cart_${restaurantId}`;
  const [items, setItems] = useState<CartItem[]>([]);
  // Clave cuyo contenido ya se cargó: hasta entonces no se escribe (evita pisar el carrito
  // del local nuevo con el del anterior al navegar entre cartas)
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);

  // Cargar el carrito de este restaurante desde localStorage
  useEffect(() => {
    let saved: CartItem[] = [];
    try {
      localStorage.removeItem(LEGACY_CART_KEY);
      const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(parsed)) saved = parsed as CartItem[];
    } catch (e) {
      console.error('Error al leer carrito local:', e);
    }
    setItems(saved);
    setHydratedKey(storageKey);
  }, [storageKey]);

  // Guardar en localStorage ante cambios
  useEffect(() => {
    if (hydratedKey !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch (e) {
      console.error('Error al guardar carrito local:', e);
    }
  }, [items, hydratedKey, storageKey]);

  const addItem = (item: Omit<CartItem, 'quantity'>, quantity: number = 1) => {
    setItems((prevItems) => {
      const existingIndex = prevItems.findIndex((i) => i.id === item.id);
      if (existingIndex > -1) {
        const updated = [...prevItems];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantity,
        };
        return updated;
      }
      return [...prevItems, { ...item, quantity }];
    });
  };

  const removeItem = (id: string) => {
    setItems((prevItems) => prevItems.filter((item) => item.id !== id));
  };

  const removeItems = (ids: string[]) => {
    const remove = new Set(ids);
    setItems((prevItems) => prevItems.filter((item) => !remove.has(item.id)));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(id);
      return;
    }
    setItems((prevItems) =>
      prevItems.map((item) => (item.id === id ? { ...item, quantity } : item))
    );
  };

  const clearCart = () => {
    setItems([]);
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {
      console.error(e);
    }
  };

  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        removeItems,
        updateQuantity,
        clearCart,
        totalCount,
        totalAmount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart debe ser utilizado dentro de un CartProvider');
  }
  return context;
};
