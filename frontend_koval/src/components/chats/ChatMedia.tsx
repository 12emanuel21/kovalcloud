'use client';

import React, { useEffect, useState } from 'react';
import { FileText, ImageOff, Loader2, Mic, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export type ChatMediaType = 'image' | 'audio' | 'document';

const isExternal = (url: string) => /^https?:\/\//i.test(url);

/**
 * URL utilizable de un adjunto. Los guardados en el servidor (fotos, comprobantes, notas de voz)
 * no son públicos: se piden con la sesión (GET /restaurants/:id/chats/media/:file) y se muestran
 * como blob. Los enlaces externos (p. ej. un PDF de respuesta rápida) se usan tal cual.
 */
export function useChatMediaUrl(restaurantId: string | null | undefined, mediaUrl: string | null | undefined) {
  const { token } = useAuth();
  const external = mediaUrl && isExternal(mediaUrl) ? mediaUrl : null;
  const [state, setState] = useState<{ key: string; url: string | null; failed: boolean } | null>(null);
  const key = `${restaurantId}|${mediaUrl}`;

  useEffect(() => {
    if (!restaurantId || !mediaUrl || external || !token) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}/chats/media/${encodeURIComponent(mediaUrl)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ key, url: objectUrl, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ key, url: null, failed: true });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [restaurantId, mediaUrl, external, token, key]);

  if (external) return { url: external, loading: false, failed: false };
  const current = state?.key === key ? state : null;
  return { url: current?.url ?? null, loading: !current && Boolean(mediaUrl), failed: Boolean(current?.failed) };
}

/** Visor a pantalla completa de una imagen (comprobante, foto del cliente) */
export function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" role="dialog" aria-modal="true" aria-label={alt} onClick={onClose}>
      <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- blob local del adjunto */}
      <img src={src} alt={alt} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

/**
 * Adjunto dentro de una burbuja del chat: miniatura clicable (imagen), reproductor (nota de voz)
 * o enlace que abre el PDF.
 */
export function ChatMediaAttachment({
  restaurantId,
  type,
  mediaUrl,
  name,
  tone = 'dark',
}: {
  restaurantId: string | null | undefined;
  type: ChatMediaType;
  mediaUrl: string;
  name?: string | null;
  /** Burbuja clara (cliente) u oscura de color (bot / equipo) */
  tone?: 'dark' | 'color';
}) {
  const { url, loading, failed } = useChatMediaUrl(restaurantId, mediaUrl);
  const [zoom, setZoom] = useState(false);
  const muted = tone === 'color' ? 'text-white/80' : 'text-slate-400';

  if (loading) {
    return (
      <span className={`mb-1 flex items-center gap-1.5 text-xs ${muted}`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando adjunto...
      </span>
    );
  }
  if (failed || !url) {
    return (
      <span className={`mb-1 flex items-center gap-1.5 text-xs ${muted}`}>
        <ImageOff className="h-3.5 w-3.5" /> Adjunto no disponible
      </span>
    );
  }

  if (type === 'image') {
    return (
      <>
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="mb-1 block overflow-hidden rounded-xl border border-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          title="Ver en grande"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- blob local del adjunto */}
          <img src={url} alt={name || 'Imagen del chat'} className="max-h-60 w-auto max-w-full object-cover" />
        </button>
        {zoom && <ImageLightbox src={url} alt={name || 'Imagen del chat'} onClose={() => setZoom(false)} />}
      </>
    );
  }

  if (type === 'audio') {
    return (
      <div className="mb-1 space-y-1">
        <span className={`flex items-center gap-1 text-[11px] font-semibold ${muted}`}>
          <Mic className="h-3.5 w-3.5" /> Nota de voz
        </span>
        <audio controls preload="metadata" src={url} className="h-9 w-64 max-w-full" />
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mb-1 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
        tone === 'color' ? 'border-white/25 bg-white/10 hover:bg-white/20' : 'border-slate-600 bg-slate-900/60 hover:border-slate-500'
      }`}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="truncate">{name || 'Documento PDF'}</span>
      <span className={`ml-auto shrink-0 ${muted}`}>Abrir ↗</span>
    </a>
  );
}

/** El texto del historial empieza con la etiqueta del adjunto ("📷 Imagen"): con el adjunto a la vista sobra */
export function stripMediaLabel(message: string, type: ChatMediaType | null | undefined): string {
  if (!type) return message;
  const [first, ...rest] = message.split('\n');
  return /^(📷 Imagen|🎙️ Nota de voz|📄 Documento)/.test(first) ? rest.join('\n').trim() : message;
}
