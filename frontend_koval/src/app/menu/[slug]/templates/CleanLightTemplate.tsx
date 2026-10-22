'use client';

import React from 'react';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { formatPrice, useMenuLogic } from './useMenuLogic';
import type { MenuTemplateProps } from './types';

/**
 * Tema "clean-light" (esqueleto): fondo blanco y texto negro, pendiente de diseño.
 * Ya es funcional (carrito, agotados y cierre) para que elegirlo nunca rompa la carta.
 */
export const CleanLightTemplate: React.FC<MenuTemplateProps> = ({ restaurant, categories, tableNumber }) => {
  const { isClosed, closedNotice, handleAddItem, getItemCartQuantity } = useMenuLogic(restaurant);

  return (
    <div className="min-h-screen bg-white text-black pb-32">
      <header className="max-w-md mx-auto px-4 py-5 border-b border-neutral-200">
        <h1 className="text-xl font-bold">{restaurant.name}</h1>
        {restaurant.address && <p className="text-xs text-neutral-600">{restaurant.address}</p>}
        <p className="text-xs mt-1">
          {isClosed ? 'Cerrado' : 'Abierto'}
          {tableNumber && ` · Mesa: ${tableNumber}`}
        </p>
      </header>

      <main className="max-w-md mx-auto px-4 mt-5 space-y-8">
        {isClosed && (
          <div role="status" className="p-3 border border-black rounded-lg text-sm">
            <p className="font-bold">No estamos recibiendo pedidos</p>
            <p className="text-xs">{closedNotice}</p>
          </div>
        )}

        {categories.length === 0 ? (
          <p className="text-sm text-center py-16">Este restaurante aún no tiene categorías publicadas.</p>
        ) : (
          categories.map((category) => (
            <section key={category.id} className="space-y-3">
              <h2 className="text-base font-bold uppercase border-b border-neutral-200 pb-1">{category.name}</h2>
              {category.items.map((item) => {
                const isSoldOut = !item.isAvailable;
                const quantityInCart = getItemCartQuantity(item.id);
                return (
                  <article key={item.id} className="flex justify-between items-start gap-4 py-2">
                    <div className={`min-w-0 ${isSoldOut ? 'opacity-50' : ''}`}>
                      <h3 className="font-semibold text-sm">
                        {item.name}
                        {isSoldOut && ' · Agotado'}
                        {quantityInCart > 0 && ` · ${quantityInCart} en orden`}
                      </h3>
                      {item.description && <p className="text-xs text-neutral-600">{item.description}</p>}
                      <p className={`text-sm font-bold ${isSoldOut ? 'line-through' : ''}`}>{formatPrice(item.price)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddItem(item)}
                      disabled={isSoldOut || isClosed}
                      className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-black text-white disabled:bg-neutral-300 disabled:text-neutral-500 disabled:cursor-not-allowed"
                    >
                      {isSoldOut ? 'Sin stock' : isClosed ? 'Cerrado' : 'Agregar'}
                    </button>
                  </article>
                );
              })}
            </section>
          ))
        )}
      </main>

      <CartDrawer
        restaurantId={restaurant.id}
        restaurantPhone={restaurant.phone || ''}
        tableNumber={tableNumber}
        isClosed={isClosed}
        closedNotice={closedNotice}
      />
    </div>
  );
};
