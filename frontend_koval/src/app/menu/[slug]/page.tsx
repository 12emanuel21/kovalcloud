import { CartProvider } from '@/context/CartContext';
import { MenuView, RestaurantData } from './MenuView';

const API_URL = typeof window !== 'undefined' ? '/api' : 'http://koval_backend:4000';

async function getRestaurantMenu(slug: string): Promise<RestaurantData | null> {
  try {
    const res = await fetch(`${API_URL}/restaurants/slug/${slug}`, {
      cache: 'no-store', // Siempre obtiene los datos más recientes
    });
    if (!res.ok) return null;
    return res.json();
  } catch (error) {
    console.error('Error fetching restaurant menu:', error);
    return null;
  }
}

export default async function MenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const table = typeof resolvedSearchParams.table === 'string' ? resolvedSearchParams.table : undefined;
  const restaurant = await getRestaurantMenu(slug);

  if (!restaurant) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="text-center bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-sm w-full shadow-2xl">
          <div className="h-12 w-12 mx-auto mb-3 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
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
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white">Restaurante no encontrado</h1>
          <p className="text-slate-400 text-xs mt-2">
            Verifica el enlace o contacta directamente con el negocio.
          </p>
        </div>
      </main>
    );
  }

  return (
    <CartProvider>
      <MenuView restaurant={restaurant} tableNumber={table} />
    </CartProvider>
  );
}
