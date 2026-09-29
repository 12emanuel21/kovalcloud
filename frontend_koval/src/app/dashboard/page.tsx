'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isAvailable?: boolean;
  categoryId: string;
  restaurantId?: string;
}

interface Category {
  id: string;
  name: string;
  order: number;
  restaurantId: string;
  items?: MenuItem[];
}

const API_URL = 'http://localhost:4000';

export default function DashboardPage() {
  const router = useRouter();
  const { restaurantId, restaurant , token} = useAuth();

  // Estados principales
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Estados para formulario de Categoría
  const [categoryName, setCategoryName] = useState('');
  const [categoryOrder, setCategoryOrder] = useState<number | ''>(0);
  const [isSubmittingCategory, setIsSubmittingCategory] = useState(false);
  const [categoryMsg, setCategoryMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Estados para formulario de Plato
  const [dishName, setDishName] = useState('');
  const [dishDescription, setDishDescription] = useState('');
  const [dishPrice, setDishPrice] = useState<number | ''>('');
  const [dishCategoryId, setDishCategoryId] = useState('');
  const [isSubmittingDish, setIsSubmittingDish] = useState(false);
  const [dishMsg, setDishMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Estados para Modal de Edición de Plato
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPrice, setEditPrice] = useState<number | ''>('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editIsAvailable, setEditIsAvailable] = useState<boolean>(true);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Estados de carga individual
  const [togglingItemId, setTogglingItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);

  // Cargar categorías desde el backend
  const fetchCategories = useCallback(async (showLoader = false) => {
    if (!restaurantId) return;
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/categories?restaurantId=${restaurantId}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error(`Error en el servidor: ${res.status} ${res.statusText}`);
      }
      const data: Category[] = await res.json();
      setCategories(data);
      if (data.length > 0 && !dishCategoryId) {
        setDishCategoryId(data[0].id);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No se pudo conectar con el servidor NestJS';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [dishCategoryId, restaurantId]);

  useEffect(() => {
    if (restaurantId) {
      fetchCategories(true);
    }
  }, [fetchCategories, restaurantId]);

  // Manejador: Crear Categoría
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim()) {
      setCategoryMsg({ type: 'error', text: 'El nombre de la categoría es obligatorio.' });
      return;
    }

    setIsSubmittingCategory(true);
    setCategoryMsg(null);

    try {
      const payload = {
        name: categoryName.trim(),
        order: categoryOrder === '' ? 0 : Number(categoryOrder),
        restaurantId,
      };

      const res = await fetch(`${API_URL}/categories`, {
        method: 'POST',
        headers: {
        'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Error al crear categoría (${res.status})`);
      }

      setCategoryMsg({ type: 'success', text: `¡Categoría "${categoryName}" creada exitosamente!` });
      setCategoryName('');
      setCategoryOrder(0);

      await fetchCategories(false);
      router.refresh();

      setTimeout(() => setCategoryMsg(null), 4000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al crear la categoría';
      setCategoryMsg({ type: 'error', text: message });
    } finally {
      setIsSubmittingCategory(false);
    }
  };

  // Manejador: Crear Plato
  const handleCreateDish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dishName.trim()) {
      setDishMsg({ type: 'error', text: 'El nombre del plato es obligatorio.' });
      return;
    }
    if (dishPrice === '' || isNaN(Number(dishPrice)) || Number(dishPrice) < 0) {
      setDishMsg({ type: 'error', text: 'Ingresa un precio válido (mayor o igual a 0).' });
      return;
    }
    if (!dishCategoryId) {
      setDishMsg({ type: 'error', text: 'Debes seleccionar una categoría.' });
      return;
    }

    setIsSubmittingDish(true);
    setDishMsg(null);

    try {
      const payload = {
        name: dishName.trim(),
        description: dishDescription.trim() || undefined,
        price: Number(dishPrice),
        categoryId: dishCategoryId,
        restaurantId,
      };

      const res = await fetch(`${API_URL}/menu-items`, {
        method: 'POST',
        headers: {
        'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Error al crear plato (${res.status})`);
      }

      setDishMsg({ type: 'success', text: `¡Plato "${dishName}" creado exitosamente!` });
      setDishName('');
      setDishDescription('');
      setDishPrice('');

      await fetchCategories(false);
      router.refresh();

      setTimeout(() => setDishMsg(null), 4000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al crear el plato';
      setDishMsg({ type: 'error', text: message });
    } finally {
      setIsSubmittingDish(false);
    }
  };

  // Manejador: Toggle Disponibilidad (isAvailable)
  const handleToggleAvailability = async (item: MenuItem) => {
    const nextAvailability = !(item.isAvailable ?? true);
    setTogglingItemId(item.id);

    try {
      const res = await fetch(`${API_URL}/menu-items/${item.id}`, {
        method: 'PATCH',
        headers: {
        'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable: nextAvailability }),
      });

      if (!res.ok) {
        throw new Error('No se pudo actualizar la disponibilidad');
      }

      setCategories((prevCategories) =>
        prevCategories.map((cat) => ({
          ...cat,
          items: (cat.items || []).map((i) =>
            i.id === item.id ? { ...i, isAvailable: nextAvailability } : i
          ),
        }))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al cambiar disponibilidad');
    } finally {
      setTogglingItemId(null);
    }
  };

  // Manejador: Abrir Modal de Edición
  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditDescription(item.description || '');
    setEditPrice(item.price);
    setEditCategoryId(item.categoryId);
    setEditIsAvailable(item.isAvailable ?? true);
    setEditError(null);
  };

  // Manejador: Guardar Edición de Plato
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    if (!editName.trim()) {
      setEditError('El nombre del plato es obligatorio.');
      return;
    }
    if (editPrice === '' || isNaN(Number(editPrice)) || Number(editPrice) < 0) {
      setEditError('Ingresa un precio válido.');
      return;
    }

    setIsSubmittingEdit(true);
    setEditError(null);

    try {
      const payload = {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        price: Number(editPrice),
        categoryId: editCategoryId,
        isAvailable: editIsAvailable,
      };

      const res = await fetch(`${API_URL}/menu-items/${editingItem.id}`, {
        method: 'PATCH',
        headers: {
        'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Error al guardar cambios');
      }

      await fetchCategories(false);
      setEditingItem(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error al actualizar plato');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Manejador: Eliminar Plato
  const handleDeleteItem = async (item: MenuItem) => {
    const confirmDelete = window.confirm(`¿Estás seguro de eliminar el plato "${item.name}"?`);
    if (!confirmDelete) return;

    setDeletingItemId(item.id);

    try {
      const res = await fetch(`${API_URL}/menu-items/${item.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('No se pudo eliminar el plato');
      }

      setCategories((prevCategories) =>
        prevCategories.map((cat) => ({
          ...cat,
          items: (cat.items || []).filter((i) => i.id !== item.id),
        }))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar plato');
    } finally {
      setDeletingItemId(null);
    }
  };

  // Manejador: Eliminar Categoría
  const handleDeleteCategory = async (category: Category) => {
    const itemsCount = category.items?.length || 0;
    const confirmDelete = window.confirm(
      `¿Estás seguro de eliminar la categoría "${category.name}"? ${
        itemsCount > 0 ? `Se eliminarán también sus ${itemsCount} platos asociados.` : ''
      }`
    );
    if (!confirmDelete) return;

    setDeletingCatId(category.id);

    try {
      const res = await fetch(`${API_URL}/categories/${category.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('No se pudo eliminar la categoría');
      }

      setCategories((prevCategories) =>
        prevCategories.filter((cat) => cat.id !== category.id)
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar categoría');
    } finally {
      setDeletingCatId(null);
    }
  };

  const totalDishes = categories.reduce((acc, cat) => acc + (cat.items?.length || 0), 0);

  return (
    <div className="space-y-8">
      {/* Encabezado Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">
            Gestión de Menú
          </span>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mt-1">
            {restaurant ? `Menú de ${restaurant.name}` : 'Menú del Restaurante'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Administra categorías, platos, precios y disponibilidad en tiempo real.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchCategories(true)}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition disabled:opacity-50"
            title="Recargar datos"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-4 w-4 ${loading ? 'animate-spin text-emerald-400' : 'text-slate-400'}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
            <span>{loading ? 'Actualizando...' : 'Refrescar'}</span>
          </button>
        </div>
      </div>

      {/* Tarjetas de Métricas Rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="7" height="7" x="3" y="3" rx="1" />
              <rect width="7" height="7" x="14" y="3" rx="1" />
              <rect width="7" height="7" x="14" y="14" rx="1" />
              <rect width="7" height="7" x="3" y="14" rx="1" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Categorías Activas</p>
            <p className="text-2xl font-bold text-white tracking-tight">{categories.length}</p>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
              <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
              <line x1="6" y1="1" x2="6" y2="4" />
              <line x1="10" y1="1" x2="10" y2="4" />
              <line x1="14" y1="1" x2="14" y2="4" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Platos Registrados</p>
            <p className="text-2xl font-bold text-white tracking-tight">{totalDishes}</p>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">ID Restaurante</p>
            <p className="text-xs font-mono font-semibold text-slate-300 truncate max-w-[170px]" title={restaurantId}>
              {restaurantId.substring(0, 13)}...
            </p>
          </div>
        </div>
      </div>

      {/* Alerta de Error de Conexión */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3 text-red-300">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-red-400 shrink-0 mt-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-200">Error al cargar datos del restaurante</p>
            <p className="text-xs text-red-400/90 mt-0.5">{error}</p>
          </div>
          <button
            onClick={() => fetchCategories(true)}
            className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-xs font-medium transition"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Sección Principal de 2 Columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Columna Izquierda: Formularios */}
        <div className="lg:col-span-5 space-y-6">
          {/* Formulario 1: Crear Categoría */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl relative backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Nueva Categoría</h2>
                <p className="text-xs text-slate-400">Agrupa tus platos en el menú</p>
              </div>
            </div>

            {categoryMsg && (
              <div
                className={`mb-4 p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  categoryMsg.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}
              >
                <span>{categoryMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleCreateCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Nombre de la Categoría <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="Ej. Entradas, Bebidas, Fuertes..."
                  required
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Orden de Visualización
                </label>
                <input
                  type="number"
                  value={categoryOrder}
                  onChange={(e) => setCategoryOrder(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  min="0"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Número menor aparece primero en el menú digital.
                </span>
              </div>

              <button
                type="submit"
                disabled={isSubmittingCategory}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-[0.98]"
              >
                {isSubmittingCategory ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Guardando categoría...</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14" />
                      <path d="M12 5v14" />
                    </svg>
                    <span>Crear Categoría</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Formulario 2: Crear Plato */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl relative backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Nuevo Plato</h2>
                <p className="text-xs text-slate-400">Añade un plato o bebida a tu menú</p>
              </div>
            </div>

            {dishMsg && (
              <div
                className={`mb-4 p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  dishMsg.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}
              >
                <span>{dishMsg.text}</span>
              </div>
            )}

            {categories.length === 0 ? (
              <div className="bg-slate-950/60 border border-dashed border-slate-800 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-400">
                  Primero debes crear al menos una <strong className="text-emerald-400">categoría</strong> para poder registrar platos.
                </p>
              </div>
            ) : (
              <form onSubmit={handleCreateDish} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Categoría Destino <span className="text-emerald-400">*</span>
                  </label>
                  <select
                    value={dishCategoryId}
                    onChange={(e) => setDishCategoryId(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none transition"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id} className="bg-slate-900 text-white">
                        {cat.name} (Orden: #{cat.order})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Nombre del Plato <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={dishName}
                    onChange={(e) => setDishName(e.target.value)}
                    placeholder="Ej. Hamburguesa Doble Queso"
                    required
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Precio (COP) <span className="text-emerald-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-slate-500 text-sm font-semibold">$</span>
                    <input
                      type="number"
                      value={dishPrice}
                      onChange={(e) => setDishPrice(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="25000"
                      min="0"
                      step="100"
                      required
                      className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl pl-8 pr-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Descripción (Opcional)
                  </label>
                  <textarea
                    value={dishDescription}
                    onChange={(e) => setDishDescription(e.target.value)}
                    placeholder="Detalla los ingredientes o características especiales..."
                    rows={2}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingDish}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 active:scale-[0.98]"
                >
                  {isSubmittingDish ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Guardando plato...</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14" />
                        <path d="M12 5v14" />
                      </svg>
                      <span>Crear Plato</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Columna Derecha: Vista del Menú y Categorías */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>Estructura del Menú</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {categories.length} {categories.length === 1 ? 'categoría' : 'categorías'}
              </span>
            </h2>
          </div>

          {loading && categories.length === 0 ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 animate-pulse space-y-4">
                  <div className="h-5 bg-slate-800 rounded w-1/3" />
                  <div className="space-y-2">
                    <div className="h-16 bg-slate-800/60 rounded-xl" />
                    <div className="h-16 bg-slate-800/60 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : categories.length === 0 ? (
            <div className="bg-slate-900/40 border-2 border-dashed border-slate-800 rounded-3xl p-12 text-center space-y-4">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
                  <path d="M7 2v20" />
                  <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-200">No hay categorías en el menú</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Comienza creando tu primera categoría en el formulario de la izquierda (ej. "Entradas" o "Bebidas").
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {categories.map((category) => (
                <section
                  key={category.id}
                  className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-5 shadow-lg backdrop-blur-sm space-y-4 transition hover:border-slate-700"
                >
                  {/* Encabezado de la Categoría */}
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        #{category.order}
                      </span>
                      <h3 className="font-bold text-white text-base md:text-lg">
                        {category.name}
                      </h3>
                      <span className="text-xs text-slate-400 font-medium">
                        ({category.items?.length || 0} {(category.items?.length || 0) === 1 ? 'plato' : 'platos'})
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={deletingCatId === category.id}
                      onClick={() => handleDeleteCategory(category)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition disabled:opacity-50"
                      title="Eliminar categoría"
                    >
                      {deletingCatId === category.id ? (
                        <svg className="animate-spin h-4 w-4 text-rose-400" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* Listado de Platos */}
                  {!category.items || category.items.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-950/40 border border-dashed border-slate-800 text-center">
                      <p className="text-xs text-slate-500 italic">
                        Esta categoría aún no contiene platos. Puedes crear uno usando el formulario.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-2.5">
                      {category.items.map((item) => {
                        const isAvailable = item.isAvailable !== false;
                        const isToggling = togglingItemId === item.id;
                        const isDeleting = deletingItemId === item.id;

                        return (
                          <article
                            key={item.id}
                            className={`bg-slate-950/80 border rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                              isAvailable
                                ? 'border-slate-800/80 hover:border-slate-700'
                                : 'border-rose-950/50 bg-slate-950/40 opacity-70'
                            }`}
                          >
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-semibold text-slate-100 text-sm">{item.name}</h4>

                                <button
                                  type="button"
                                  disabled={isToggling}
                                  onClick={() => handleToggleAvailability(item)}
                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold transition active:scale-95 disabled:opacity-50 ${
                                    isAvailable
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'
                                  }`}
                                  title="Haz clic para cambiar disponibilidad"
                                >
                                  {isToggling ? (
                                    <span className="animate-spin h-2 w-2 rounded-full border border-current border-t-transparent" />
                                  ) : (
                                    <span
                                      className={`h-1.5 w-1.5 rounded-full ${
                                        isAvailable ? 'bg-emerald-400' : 'bg-rose-400'
                                      }`}
                                    />
                                  )}
                                  <span>{isAvailable ? 'Disponible' : 'Agotado'}</span>
                                </button>
                              </div>

                              {item.description && (
                                <p className="text-xs text-slate-400 leading-relaxed max-w-md">
                                  {item.description}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                              <span className="text-sm font-extrabold text-emerald-400 font-mono">
                                ${item.price.toLocaleString('es-CO')} COP
                              </span>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditModal(item)}
                                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition"
                                  title="Editar plato"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-3.5 w-3.5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                    <path d="m15 5 4 4" />
                                  </svg>
                                </button>

                                <button
                                  type="button"
                                  disabled={isDeleting}
                                  onClick={() => handleDeleteItem(item)}
                                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-slate-800 transition disabled:opacity-50"
                                  title="Eliminar plato"
                                >
                                  {isDeleting ? (
                                    <svg className="animate-spin h-3.5 w-3.5 text-rose-400" viewBox="0 0 24 24" fill="none">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                    </svg>
                                  ) : (
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      className="h-3.5 w-3.5"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M3 6h18" />
                                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                    </svg>
                                  )}
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Edición de Plato */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={() => setEditingItem(null)}
          />

          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-xs border border-blue-500/20">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    <path d="m15 5 4 4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Editar Plato</h3>
                  <p className="text-xs text-slate-400">Modifica los datos del plato</p>
                </div>
              </div>

              <button
                onClick={() => setEditingItem(null)}
                className="h-8 w-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              {editError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
                  {editError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nombre del Plato <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3.5 py-2 text-sm text-white outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Precio (COP) <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    type="number"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                    min="0"
                    step="100"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3.5 py-2 text-sm text-white outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Categoría <span className="text-emerald-400">*</span>
                  </label>
                  <select
                    value={editCategoryId}
                    onChange={(e) => setEditCategoryId(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3.5 py-2 text-sm text-white outline-none transition"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id} className="bg-slate-900 text-white">
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Descripción
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3.5 py-2 text-sm text-white outline-none transition resize-none"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div>
                  <p className="text-xs font-semibold text-white">Disponibilidad en el Menú</p>
                  <p className="text-[11px] text-slate-400">
                    {editIsAvailable ? 'Visible y disponible para ordenar' : 'Marcado como agotado'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditIsAvailable(!editIsAvailable)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    editIsAvailable
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}
                >
                  {editIsAvailable ? '✓ Disponible' : '✕ Agotado'}
                </button>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition shadow-lg shadow-blue-600/20 flex items-center gap-2"
                >
                  {isSubmittingEdit ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Guardar Cambios</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
