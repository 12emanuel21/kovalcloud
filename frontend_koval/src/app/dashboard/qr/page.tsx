'use client';

import React, { useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { QRCodeCanvas } from 'qrcode.react';

export default function QRGeneratorPage() {
  const { restaurant , token} = useAuth();

  const restaurantName = restaurant?.name || 'Mi Restaurante';
  const restaurantSlug = restaurant?.slug || 'pizzeria-napoles';

  // Opciones de Configuración
  const [tableNumber, setTableNumber] = useState<string>('1');
  const [baseUrl, setBaseUrl] = useState<string>('http://localhost:3030');
  const [includeTableParam, setIncludeTableParam] = useState<boolean>(true);
  const [qrColor, setQrColor] = useState<string>('#0f172a');
  const [qrBgColor, setQrBgColor] = useState<string>('#ffffff');
  const [downloadResolution, setDownloadResolution] = useState<number>(1024);
  const [copied, setCopied] = useState<boolean>(false);

  const qrCanvasRef = useRef<HTMLDivElement>(null);

  // Construcción de la URL final
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const targetUrl = includeTableParam && tableNumber.trim()
    ? `${cleanBase}/menu/${restaurantSlug}?table=${encodeURIComponent(tableNumber.trim())}`
    : `${cleanBase}/menu/${restaurantSlug}`;

  // Copiar Enlace al portapapeles
  const handleCopyLink = () => {
    navigator.clipboard.writeText(targetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  // Descargar Imagen PNG en Alta Resolución
  const handleDownloadQR = () => {
    const container = qrCanvasRef.current;
    if (!container) return;

    const canvas = container.querySelector('canvas');
    if (!canvas) return;

    // Crear un canvas temporal a alta resolución para exportar con marco elegante
    const exportCanvas = document.createElement('canvas');
    const exportSize = downloadResolution;
    exportCanvas.width = exportSize;
    exportCanvas.height = exportSize + 220;
    const ctx = exportCanvas.getContext('2d');

    if (!ctx) return;

    // Fondo blanco
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Borde decorativo
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 16;
    ctx.strokeRect(20, 20, exportCanvas.width - 40, exportCanvas.height - 40);

    // Título del Restaurante
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 52px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(restaurantName, exportSize / 2, 90);

    // Subtítulo
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
    ctx.fillText('MENÚ DIGITAL', exportSize / 2, 135);

    // Dibujar el código QR escalado
    const qrMargin = 60;
    const qrDrawSize = exportSize - qrMargin * 2;
    ctx.drawImage(canvas, qrMargin, 160, qrDrawSize, qrDrawSize);

    // Número de Mesa o Instrucción
    if (includeTableParam && tableNumber.trim()) {
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 44px system-ui, -apple-system, sans-serif';
      ctx.fillText(`MESA ${tableNumber.trim().toUpperCase()}`, exportSize / 2, exportSize + 110);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
      ctx.fillText('ESCANEA PARA ORDENAR', exportSize / 2, exportSize + 105);
    }

    // Pie de página
    ctx.fillStyle = '#64748b';
    ctx.font = '22px system-ui, -apple-system, sans-serif';
    ctx.fillText('Powered by Koval Cloud', exportSize / 2, exportSize + 160);

    // Generar y disparar descarga
    const pngUrl = exportCanvas.toDataURL('image/png');
    const downloadLink = document.createElement('a');
    const tableSuffix = includeTableParam && tableNumber.trim() ? `-Mesa-${tableNumber.trim()}` : '';
    downloadLink.download = `QR-${restaurantSlug}${tableSuffix}.png`;
    downloadLink.href = pngUrl;
    downloadLink.click();
  };

  // Imprimir Ficha / Stand
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-6 print:hidden">
        <div>
          <span className="text-xs font-semibold text-purple-400 uppercase tracking-widest">
            Marketing & Mesas
          </span>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mt-1">
            Generador de Códigos QR
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Crea, personaliza y descarga los códigos QR para las mesas y material impreso de tu restaurante.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs font-semibold transition active:scale-95 shadow-sm"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect width="12" height="8" x="6" y="14" />
            </svg>
            <span>Imprimir Stand</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadQR}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 text-xs font-bold transition active:scale-95 shadow-lg shadow-emerald-500/20"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-slate-950"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Descargar PNG</span>
          </button>
        </div>
      </div>

      {/* Grid Principal: Configuración (Izquierda) y Vista Previa (Derecha) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Panel de Configuración */}
        <div className="lg:col-span-6 space-y-6 print:hidden">
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
            <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <span className="h-2 w-2 rounded-full bg-purple-400" />
              <span>Personalizar Código QR</span>
            </h2>

            {/* Número de Mesa */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">
                  Identificador de Mesa / Ubicación
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={includeTableParam}
                    onChange={(e) => setIncludeTableParam(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span>Asignar a Mesa</span>
                </label>
              </div>

              {includeTableParam ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['1', '2', '3', '4', '5', 'Barra', 'Terraza', 'VIP'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTableNumber(preset)}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                        tableNumber === preset
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-sm'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {preset.startsWith('Mesa') || isNaN(Number(preset)) ? preset : `Mesa ${preset}`}
                    </button>
                  ))}
                </div>
              ) : null}

              {includeTableParam && (
                <input
                  type="text"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="Número o nombre de mesa (ej. 1, 12, VIP)"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                />
              )}
            </div>

            {/* URL Base y Enlace Destino */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="block text-xs font-semibold text-slate-300">
                Dominio / URL Base
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:3030"
                className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-300 placeholder-slate-600 outline-none transition"
              />

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Enlace Codificado en el QR:
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition"
                  >
                    {copied ? '✓ ¡Copiado!' : 'Copiar URL'}
                  </button>
                </div>
                <p className="text-xs font-mono text-emerald-400/90 break-all select-all">
                  {targetUrl}
                </p>
              </div>
            </div>

            {/* Opciones de Color */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <label className="block text-xs font-semibold text-slate-300">
                Tema de Color del Código QR
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Negro Clásico', fg: '#0f172a', bg: '#ffffff' },
                  { label: 'Verde Esmeralda', fg: '#065f46', bg: '#ffffff' },
                  { label: 'Azul Marino', fg: '#1e3a8a', bg: '#ffffff' },
                  { label: 'Morado Real', fg: '#581c87', bg: '#ffffff' },
                ].map((palette) => (
                  <button
                    key={palette.label}
                    type="button"
                    onClick={() => {
                      setQrColor(palette.fg);
                      setQrBgColor(palette.bg);
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition ${
                      qrColor === palette.fg
                        ? 'bg-slate-800 border-purple-500/50 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span
                      className="h-4 w-4 rounded-full border border-slate-600 shrink-0"
                      style={{ backgroundColor: palette.fg }}
                    />
                    <span className="truncate text-[11px]">{palette.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Resolución de Exportación */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="block text-xs font-semibold text-slate-300">
                Calidad de Descarga
              </label>
              <select
                value={downloadResolution}
                onChange={(e) => setDownloadResolution(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl px-3.5 py-2 text-xs text-slate-200 outline-none transition"
              >
                <option value={512}>512 x 512 px (Digital / Web)</option>
                <option value={1024}>1024 x 1024 px (Alta Resolución / Flyers)</option>
                <option value={2048}>2048 x 2048 px (Ultra HD / Impresión Profesional)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Vista Previa del Stand / Ficha de Mesa */}
        <div className="lg:col-span-6 flex flex-col items-center">
          <div className="w-full max-w-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 text-center print:hidden">
              Vista Previa del Stand de Mesa
            </p>

            {/* Stand Físico Mockup / Tarjeta Imprimible */}
            <div className="bg-white text-slate-950 rounded-3xl p-8 shadow-2xl border-4 border-slate-200 text-center space-y-6 print:border-2 print:shadow-none print:m-0 print:p-8">
              {/* Header del Stand */}
              <div className="space-y-1">
                <span className="text-[11px] font-black text-emerald-600 uppercase tracking-widest">
                  Menú Digital
                </span>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                  {restaurantName}
                </h3>
              </div>

              {/* Contenedor del QR Canvas */}
              <div
                ref={qrCanvasRef}
                className="bg-slate-50 p-5 rounded-2xl inline-block border border-slate-200/90 shadow-inner"
              >
                <QRCodeCanvas
                  value={targetUrl}
                  size={210}
                  bgColor={qrBgColor}
                  fgColor={qrColor}
                  level="H"
                  includeMargin={false}
                />
              </div>

              {/* Indicador de Mesa */}
              {includeTableParam && tableNumber.trim() && (
                <div className="inline-block bg-slate-900 text-white font-extrabold text-xs px-4 py-1.5 rounded-full uppercase tracking-wider">
                  Mesa {tableNumber.trim()}
                </div>
              )}

              {/* Instrucciones al Comensal */}
              <div className="space-y-1 text-slate-600">
                <p className="text-xs font-bold text-slate-900">
                  ¡Escanea con tu celular para ordenar!
                </p>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Abre la cámara de tu teléfono, apunta al código y descubre nuestras opciones en tiempo real.
                </p>
              </div>

              {/* Branding Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Powered by</span>
                <span className="text-slate-700">Koval Cloud</span>
              </div>
            </div>

            {/* Acciones Rápidas bajo la tarjeta */}
            <div className="mt-4 flex items-center justify-center gap-3 print:hidden">
              <a
                href={targetUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-slate-400 hover:text-emerald-400 flex items-center gap-1 transition font-medium"
              >
                <span>Probar enlace del menú</span>
                <span className="font-mono">↗</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
