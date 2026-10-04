'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

const API_URL = typeof window !== 'undefined' ? '/api' : 'http://koval_backend:4000';

export default function MenuManagementPage() {
  const { restaurantId, token } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file || !restaurantId) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const currentToken = token || (typeof window !== 'undefined' ? localStorage.getItem('koval_token') : null);
      const res = await fetch(`${API_URL}/restaurants/${restaurantId}/menu/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
        body: formData,
      });

      if (!res.ok) throw new Error('Error al procesar el PDF');
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto text-white">
      <h1 className="text-3xl font-bold mb-2">Gestión de Menú (IA)</h1>
      <p className="text-gray-400 mb-8">Sube tu PDF y deja que la IA organice tus categorías y productos.</p>

      <div className="bg-[#1A1D27] border border-gray-700 rounded-xl p-8 mb-8 text-center">
        <input 
          type="file" 
          accept="application/pdf" 
          onChange={handleFileChange} 
          className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-500 file:text-white hover:file:bg-emerald-600 mb-4 cursor-pointer"
        />
        <button 
          onClick={handleUpload} 
          disabled={!file || loading}
          className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 px-8 rounded-lg disabled:opacity-50 transition-all"
        >
          {loading ? 'Procesando PDF con Gemini...' : 'Digitalizar Menú'}
        </button>
        {error && <p className="text-red-400 mt-4">{error}</p>}
      </div>

      {result && (
        <div className="bg-[#1A1D27] border border-gray-700 rounded-xl p-6">
          <h2 className="text-xl font-bold mb-4 text-emerald-400">✅ {result.message}</h2>
          <div className="space-y-6">
            {result.categories.map((cat: any, i: number) => (
              <div key={i} className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-bold border-b border-gray-700 pb-2 mb-3">{cat.name}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {cat.items.map((item: any, j: number) => (
                    <div key={j} className="bg-gray-700 p-3 rounded flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{item.name}</p>
                        {item.description && <p className="text-sm text-gray-400 mt-1">{item.description}</p>}
                      </div>
                      <p className="font-bold text-emerald-400">${item.price}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
