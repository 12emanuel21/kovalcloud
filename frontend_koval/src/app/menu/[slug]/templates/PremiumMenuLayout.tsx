'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Bike,
  ChefHat,
  Clock,
  CreditCard,
  LayoutGrid,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Search,
  ShoppingCart,
} from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { toWhatsAppNumber, whatsappLink } from '@/lib/whatsapp';
import {
  DAY_NAMES,
  WEEK_DAYS,
  currentClosingTime,
  formatClock12h,
  formatLocalTime,
  getLocalWeekDay,
  hasActiveExtension,
} from '@/lib/business-hours';
import type { MenuTheme } from '@/lib/menu-themes';
import { formatPrice, useMenuLogic } from './useMenuLogic';
import { getCategoryIcon } from './categoryIcons';
import type { MenuPalette } from './palettes';
import type { Category, MenuItem, MenuTemplateProps } from './types';

/** Borde izquierdo "rasgado" del hero en el tema claro */
const TORN_EDGE =
  'polygon(5% 0, 100% 0, 100% 100%, 1% 100%, 3% 93%, 0.5% 86%, 4% 78%, 1.5% 70%, 5% 62%, 2% 54%, 4.5% 46%, 1% 38%, 4% 30%, 1.5% 22%, 5% 14%, 2.5% 7%)';

const MENU_ANCHOR = 'menu';

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

interface PremiumMenuLayoutProps extends MenuTemplateProps {
  palette: MenuPalette;
  theme: MenuTheme;
}

/**
 * Carta pública premium (inspirada en sitios de cadenas de comida): header con buscador y carrito,
 * hero a pantalla completa, barra de categorías con iconos, tarjetas con imagen, pasos para pedir,
 * horarios/contacto y footer. Los temas solo cambian la paleta.
 */
export function PremiumMenuLayout({
  restaurant,
  categories,
  tableNumber,
  returnedOrderId,
  palette,
  theme,
}: PremiumMenuLayoutProps) {
  const { isClosed, closedNotice, scheduleGroups, handleAddItem, getItemCartQuantity, isJustAdded } =
    useMenuLogic(restaurant);
  const { totalCount } = useCart();

  const [activeCategory, setActiveCategory] = useState<'all' | string>('all');
  const [query, setQuery] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [showPaymentReturn, setShowPaymentReturn] = useState(Boolean(returnedOrderId));

  const statusLabel = useMemo(() => {
    if (isClosed) return 'Cerrado ahora';
    if (hasActiveExtension(restaurant.extendedUntil)) {
      return `Abierto hasta las ${formatLocalTime(restaurant.extendedUntil!)}`;
    }
    const closing = currentClosingTime(restaurant.businessHours);
    return closing ? `Abierto hasta las ${formatClock12h(closing)}` : 'Abierto ahora';
  }, [isClosed, restaurant.extendedUntil, restaurant.businessHours]);

  // Categoría elegida + búsqueda por nombre o descripción
  const visibleCategories = useMemo(() => {
    const q = normalize(query.trim());
    const matches = (item: MenuItem) =>
      !q || normalize(item.name).includes(q) || normalize(item.description ?? '').includes(q);
    return categories
      .filter((category) => activeCategory === 'all' || category.id === activeCategory)
      .map((category) => ({ ...category, items: category.items.filter(matches) }))
      .filter((category) => !q || category.items.length > 0);
  }, [categories, activeCategory, query]);

  const scrollToMenu = () => document.getElementById(MENU_ANCHOR)?.scrollIntoView({ behavior: 'smooth' });

  const selectCategory = (id: 'all' | string) => {
    setActiveCategory(id);
    scrollToMenu();
  };

  const initial = restaurant.name.trim().charAt(0).toUpperCase() || 'K';
  // Dígitos con indicativo (wa.me lo exige); lo calcula el backend, con respaldo local
  const whatsappNumber = restaurant.whatsappNumber ?? toWhatsAppNumber(restaurant.phone);
  const today = getLocalWeekDay();

  return (
    <div className={`min-h-screen antialiased ${palette.page}`}>
      {/* ───────── Header ───────── */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-xl ${palette.nav}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:gap-6 md:px-6">
          <a href="#top" className="flex min-w-0 items-center gap-2.5">
            {restaurant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- logo en dominio arbitrario del restaurante
              <img src={restaurant.logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 font-display text-base font-black text-white shadow-lg shadow-red-600/30">
                {initial}
              </span>
            )}
            <span className={`truncate font-display text-lg font-black uppercase tracking-tight ${palette.heading}`}>
              {restaurant.name}
            </span>
          </a>

          <nav className={`hidden items-center gap-6 text-sm font-semibold lg:flex ${palette.heading}`}>
            <a href={`#${MENU_ANCHOR}`} className="transition hover:text-red-500">
              Menú
            </a>
            <a href="#como-pedir" className="transition hover:text-red-500">
              Cómo pedir
            </a>
            <a href="#horarios" className="transition hover:text-red-500">
              Horarios
            </a>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <label className="relative hidden md:block">
              <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${palette.muted}`} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar platos..."
                aria-label="Buscar platos"
                className={`h-10 w-56 rounded-xl border pl-9 pr-3 text-sm outline-none transition lg:w-72 ${palette.input}`}
              />
            </label>

            {tableNumber && (
              <span className={`hidden rounded-lg border px-2.5 py-1.5 text-xs font-bold sm:inline-block ${palette.chip}`}>
                Mesa {tableNumber}
              </span>
            )}

            <button
              type="button"
              onClick={() => setCartOpen(true)}
              aria-label={`Ver pedido (${totalCount} productos)`}
              className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition ${palette.secondaryButton}`}
            >
              <ShoppingCart className="h-5 w-5" />
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-black text-white">
                {totalCount}
              </span>
            </button>

            <button
              type="button"
              onClick={scrollToMenu}
              disabled={isClosed}
              className="hidden h-10 items-center rounded-xl bg-red-600 px-4 text-sm font-bold text-white shadow-lg shadow-red-600/25 transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex"
            >
              {isClosed ? 'Cerrado' : 'Pedir ahora'}
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Regreso desde el checkout de Wompi: la confirmación real llega por webhook + WhatsApp */}
        {showPaymentReturn && returnedOrderId && (
          <div className="mx-auto max-w-7xl px-4 pt-4 md:px-6">
            <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
              <span className="text-xl" aria-hidden>
                💳
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-bold ${palette.heading}`}>
                  Recibimos tu pedido #{returnedOrderId.slice(0, 8).toUpperCase()}
                </p>
                <p className={`text-sm leading-relaxed ${palette.body}`}>
                  Si completaste el pago, te lo confirmamos por WhatsApp en unos segundos. Si no alcanzaste a pagar,
                  usa el link que te enviamos por WhatsApp.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentReturn(false)}
                aria-label="Cerrar aviso"
                className={`shrink-0 rounded-lg px-2 text-lg leading-none ${palette.muted} hover:opacity-80`}
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* ───────── Hero ───────── */}
        <section className="mx-auto grid max-w-7xl items-center gap-8 px-4 pb-10 pt-8 md:px-6 lg:grid-cols-2 lg:gap-4 lg:py-14">
          <div className="order-2 space-y-6 lg:order-1">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${palette.chip}`}
            >
              <span className={`h-2 w-2 rounded-full ${isClosed ? 'bg-zinc-400' : 'animate-pulse bg-emerald-500'}`} />
              {statusLabel}
            </span>

            <h1 className="font-display text-5xl font-black uppercase leading-[0.92] tracking-tight sm:text-6xl xl:text-7xl">
              <span className={`block break-words ${palette.heading}`}>{restaurant.name}.</span>
              <span className="block text-red-600">Pide en línea.</span>
            </h1>

            <p className={`max-w-lg text-lg leading-relaxed ${palette.body}`}>
              {restaurant.description?.trim() ||
                'Elige tus platos favoritos, arma tu pedido y confírmalo por WhatsApp en segundos.'}
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={scrollToMenu}
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-red-600 px-7 text-base font-bold text-white shadow-xl shadow-red-600/25 transition hover:bg-red-700 active:scale-[0.98]"
              >
                {isClosed ? 'Ver el menú' : 'Ordenar ahora'}
                <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href="#horarios"
                className={`inline-flex h-12 items-center rounded-xl border px-7 text-base font-bold transition ${palette.secondaryButton}`}
              >
                Horarios y ubicación
              </a>
              {whatsappNumber && (
                <a
                  href={whatsappLink(whatsappNumber, `¡Hola ${restaurant.name}! Tengo una consulta.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#25D366] px-6 text-base font-bold text-white shadow-lg shadow-[#25D366]/25 transition hover:brightness-95 active:scale-[0.98]"
                >
                  <WhatsAppGlyph />
                  Chatear por WhatsApp
                </a>
              )}
            </div>

            <ul className="grid gap-4 pt-2 sm:grid-cols-3">
              <HeroFeature icon={MessageCircle} title="Pedido por WhatsApp" text="Confirmas en un toque" palette={palette} />
              <HeroFeature
                icon={tableNumber ? ChefHat : Bike}
                title={tableNumber ? `Mesa ${tableNumber}` : 'Domicilio o recoger'}
                text={tableNumber ? 'Te lo llevamos a la mesa' : 'Como prefieras'}
                palette={palette}
              />
              <HeroFeature icon={ChefHat} title="Hecho al momento" text="Preparado al pedir" palette={palette} />
            </ul>
          </div>

          <HeroVisual restaurant={restaurant} palette={palette} initial={initial} />
        </section>

        {isClosed && (
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <div role="status" className={`flex items-start gap-3 rounded-2xl border p-4 ${palette.closedBanner}`}>
              <span className="text-xl" aria-hidden>
                🔒
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-bold ${palette.closedTitle}`}>No estamos recibiendo pedidos</p>
                <p className={`text-sm leading-relaxed ${palette.closedText}`}>{closedNotice}</p>
                {scheduleGroups.length > 0 && (
                  <dl className={`mt-3 grid gap-x-8 gap-y-1.5 border-t pt-3 text-sm sm:grid-cols-2 ${palette.closedDivider} ${palette.closedText}`}>
                    {scheduleGroups.map((group) => (
                      <div key={group.days} className="flex flex-wrap gap-x-2">
                        <dt className="font-bold">{group.days}:</dt>
                        <dd>{group.time}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ───────── Menú ───────── */}
        <section id={MENU_ANCHOR} className="mx-auto max-w-7xl scroll-mt-20 px-4 pt-8 md:px-6">
          {/* Barra de categorías con iconos (pegajosa bajo el header) */}
          <div className={`sticky top-16 z-30 -mx-4 px-4 py-3 backdrop-blur-xl md:-mx-6 md:px-6 ${palette.page}`}>
            <label className="relative mb-3 block md:hidden">
              <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${palette.muted}`} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar platos..."
                aria-label="Buscar platos"
                className={`h-11 w-full rounded-xl border pl-9 pr-3 text-sm outline-none transition ${palette.input}`}
              />
            </label>

            {categories.length > 0 && (
              <nav
                aria-label="Categorías"
                className={`flex gap-1 overflow-x-auto rounded-2xl border p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${palette.softSurface}`}
              >
                <CategoryTab
                  label="Todo"
                  icon={LayoutGrid}
                  active={activeCategory === 'all'}
                  onClick={() => selectCategory('all')}
                  palette={palette}
                />
                {categories.map((category) => (
                  <CategoryTab
                    key={category.id}
                    label={category.name}
                    icon={getCategoryIcon(category.name)}
                    active={activeCategory === category.id}
                    onClick={() => selectCategory(category.id)}
                    palette={palette}
                  />
                ))}
              </nav>
            )}
          </div>

          <div className="space-y-14 pb-6 pt-6">
            {categories.length === 0 ? (
              <EmptyState palette={palette} title="Este restaurante aún no tiene categorías publicadas." />
            ) : visibleCategories.length === 0 ? (
              <EmptyState
                palette={palette}
                title={`No encontramos platos para "${query.trim()}"`}
                action={
                  <button type="button" onClick={() => setQuery('')} className="text-sm font-bold text-red-600 hover:underline">
                    Limpiar búsqueda
                  </button>
                }
              />
            ) : (
              visibleCategories.map((category) => (
                <CategorySection
                  key={category.id}
                  category={category}
                  palette={palette}
                  isClosed={isClosed}
                  showViewOnly={activeCategory === 'all' && !query}
                  onViewOnly={() => selectCategory(category.id)}
                  onAdd={handleAddItem}
                  getQuantity={getItemCartQuantity}
                  isJustAdded={isJustAdded}
                />
              ))
            )}
          </div>
        </section>

        {/* ───────── Cómo pedir ───────── */}
        <section id="como-pedir" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-14 md:px-6">
          <h2 className={`font-display text-3xl font-black uppercase tracking-tight md:text-4xl ${palette.heading}`}>
            Pedir es <span className="text-red-600">así de fácil.</span>
          </h2>
          <p className={`mt-1 ${palette.muted}`}>Sin registros ni aplicaciones. Solo tu WhatsApp.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              { n: '01', icon: LayoutGrid, title: 'Elige tus platos', text: 'Explora la carta y agrega lo que se te antoje.' },
              { n: '02', icon: MessageCircle, title: 'Confirma por WhatsApp', text: 'Registramos tu pedido y te abrimos el chat del local.' },
              {
                n: '03',
                icon: tableNumber ? ChefHat : Bike,
                title: tableNumber ? 'Te lo llevamos a la mesa' : 'Recíbelo o recógelo',
                text: 'Te avisamos por WhatsApp cuando esté en preparación y en camino.',
              },
            ].map(({ n, icon: Icon, title, text }) => (
              <div key={n} className={`rounded-2xl border p-6 ${palette.surface}`}>
                <div className="flex items-center gap-4">
                  <span className="font-display text-4xl font-black text-red-600">{n}</span>
                  <Icon className={`h-8 w-8 ${palette.heading}`} strokeWidth={1.5} />
                </div>
                <h3 className={`mt-8 text-lg font-bold ${palette.heading}`}>{title}</h3>
                <p className={`mt-1 text-sm ${palette.muted}`}>{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ───────── Horarios y contacto ───────── */}
        <section id="horarios" className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-16 md:px-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className={`rounded-3xl border p-6 md:p-8 ${palette.surface}`}>
              <h2 className={`font-display text-3xl font-black uppercase tracking-tight ${palette.heading}`}>
                Visítanos <span className="text-red-600">o escríbenos.</span>
              </h2>
              <ul className="mt-6 space-y-5">
                {restaurant.address && (
                  <InfoRow icon={MapPin} title="Dirección" palette={palette}>
                    <span>{restaurant.address}</span>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${restaurant.address} ${restaurant.name}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-red-600 hover:underline"
                    >
                      Cómo llegar <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                  </InfoRow>
                )}
                {whatsappNumber && (
                  <InfoRow icon={Phone} title="WhatsApp" palette={palette}>
                    <a href={whatsappLink(whatsappNumber)} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {restaurant.phone}
                    </a>
                  </InfoRow>
                )}
                {restaurant.paymentDetails?.trim() && (
                  <InfoRow icon={CreditCard} title="Medios de pago" palette={palette}>
                    <span className="whitespace-pre-line">{restaurant.paymentDetails.trim()}</span>
                  </InfoRow>
                )}
                <InfoRow icon={Clock} title="Estado" palette={palette}>
                  <span className={isClosed ? '' : 'font-semibold text-emerald-500'}>{statusLabel}</span>
                </InfoRow>
              </ul>
            </div>

            <div className={`rounded-3xl border p-6 md:p-8 ${palette.surface}`}>
              <h3 className={`text-sm font-bold uppercase tracking-widest ${palette.muted}`}>Horario de atención</h3>
              {restaurant.businessHours ? (
                <ul className="mt-4 space-y-1">
                  {WEEK_DAYS.map((day) => {
                    const ranges = restaurant.businessHours?.[day] ?? [];
                    const isToday = day === today;
                    return (
                      <li
                        key={day}
                        className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm ${
                          isToday ? `font-bold ${palette.todayRow}` : palette.body
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          {DAY_NAMES[day]}
                          {isToday && (
                            <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                              Hoy
                            </span>
                          )}
                        </span>
                        <span className="text-right">
                          {ranges.length
                            ? ranges.map((r) => `${formatClock12h(r.open)} – ${formatClock12h(r.close)}`).join(' · ')
                            : 'Cerrado'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className={`mt-4 text-sm ${palette.body}`}>Atendemos todos los días.</p>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ───────── Footer ───────── */}
      <footer className={`border-t pb-28 pt-10 ${palette.border}`}>
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 md:flex-row md:items-start md:justify-between md:px-6">
          <div className="max-w-sm space-y-2">
            <p className={`font-display text-xl font-black uppercase ${palette.heading}`}>{restaurant.name}</p>
            {restaurant.description && <p className={`text-sm ${palette.muted}`}>{restaurant.description}</p>}
          </div>
          <div className={`space-y-1 text-sm ${palette.muted}`}>
            {restaurant.address && <p>📍 {restaurant.address}</p>}
            {restaurant.phone && <p>📱 {restaurant.phone}</p>}
          </div>
        </div>
        <p className={`mx-auto mt-8 max-w-7xl px-4 text-xs md:px-6 ${palette.muted}`}>
          © {new Date().getFullYear()} {restaurant.name} · Menú digital por KovalCloud
        </p>
      </footer>

      <CartDrawer
        theme={theme}
        open={cartOpen}
        onOpenChange={setCartOpen}
        restaurantId={restaurant.id}
        restaurantName={restaurant.name}
        restaurantPhone={restaurant.phone || ''}
        whatsappNumber={whatsappNumber}
        tableNumber={tableNumber}
        isClosed={isClosed}
        closedNotice={closedNotice}
        onlinePaymentsEnabled={Boolean(restaurant.onlinePaymentsEnabled)}
        isWompiEnabled={Boolean(restaurant.isWompiEnabled)}
      />
    </div>
  );
}

/* ───────────────────────── Piezas ───────────────────────── */

/** Logo de WhatsApp (lucide no lo incluye) */
function WhatsAppGlyph() {
  return (
    <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden>
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm.01 1.67c4.54 0 8.24 3.7 8.24 8.24 0 2.2-.86 4.27-2.42 5.83a8.188 8.188 0 0 1-5.82 2.41c-1.42 0-2.82-.37-4.06-1.07l-.29-.17-3.02.79.81-2.94-.19-.3a8.19 8.19 0 0 1-1.25-4.55c0-4.54 3.7-8.24 8.24-8.24zm4.72 11.64c-.26-.13-1.53-.76-1.77-.85-.24-.09-.41-.13-.58.13-.17.26-.67.85-.82 1.02-.15.17-.3.19-.56.06-.26-.13-1.1-.41-2.09-1.3-.77-.69-1.29-1.54-1.44-1.8-.15-.26-.02-.4.11-.53.12-.12.26-.3.39-.45.13-.15.17-.26.26-.43.09-.17.04-.32-.02-.45-.06-.13-.58-1.4-.79-1.92-.21-.51-.43-.44-.58-.45h-.5c-.17 0-.45.06-.69.32-.24.26-.91.89-.91 2.17s.93 2.52 1.06 2.69c.13.17 1.83 2.8 4.43 3.92.62.27 1.1.43 1.48.55.62.2 1.19.17 1.64.1.5-.07 1.53-.63 1.75-1.23.21-.6.21-1.12.15-1.23-.07-.11-.24-.17-.5-.3z" />
    </svg>
  );
}

function HeroFeature({
  icon: Icon,
  title,
  text,
  palette,
}: {
  icon: React.ElementType;
  title: string;
  text: string;
  palette: MenuPalette;
}) {
  return (
    <li className="flex items-start gap-3">
      <Icon className="mt-0.5 h-6 w-6 shrink-0 text-red-600" strokeWidth={1.75} />
      <div>
        <p className={`text-sm font-bold ${palette.heading}`}>{title}</p>
        <p className={`text-xs ${palette.muted}`}>{text}</p>
      </div>
    </li>
  );
}

function HeroVisual({ restaurant, palette, initial }: { restaurant: MenuTemplateProps['restaurant']; palette: MenuPalette; initial: string }) {
  const torn = palette.heroStyle === 'torn';
  const clip = torn ? { clipPath: TORN_EDGE } : undefined;

  return (
    <div className="relative order-1 h-56 sm:h-80 lg:order-2 lg:h-[30rem]">
      {/* Franja roja detrás del borde rasgado */}
      {torn && <div className="absolute inset-0 -translate-x-2 bg-red-600" style={clip} aria-hidden />}
      <div className={`absolute inset-0 overflow-hidden ${torn ? '' : 'rounded-3xl'}`} style={clip}>
        {restaurant.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- banner en dominio arbitrario del restaurante
          <img src={restaurant.bannerUrl} alt={restaurant.name} className="h-full w-full object-cover" />
        ) : (
          <div className={`relative flex h-full w-full items-center justify-center ${palette.heroPlaceholder}`}>
            <span className="absolute left-[12%] top-5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-900 shadow-xl sm:top-8">
              🔥 Recién hecho
            </span>
            <span className="absolute bottom-5 right-5 rounded-full bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-xl sm:bottom-8 sm:right-8">
              ⚡ Pide por WhatsApp
            </span>
            <div className="relative flex h-36 w-36 items-center justify-center rounded-full border border-white/10 bg-white/5 shadow-[0_0_120px_rgba(220,38,38,0.35)] sm:h-56 sm:w-56">
              {restaurant.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo en dominio arbitrario del restaurante
                <img src={restaurant.logoUrl} alt="" className="h-3/4 w-3/4 rounded-full object-cover" />
              ) : (
                <span className="font-display text-7xl font-black text-white sm:text-8xl">{initial}</span>
              )}
            </div>
          </div>
        )}
        {!torn && <div className={`absolute inset-y-0 left-0 hidden w-1/3 lg:block ${palette.heroFade}`} aria-hidden />}
      </div>
    </div>
  );
}

function CategoryTab({
  label,
  icon: Icon,
  active,
  onClick,
  palette,
}: {
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick: () => void;
  palette: MenuPalette;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="group relative flex min-w-[5.5rem] shrink-0 flex-col items-center gap-1.5 rounded-xl px-3 pb-2.5 pt-2 transition"
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-full border transition ${
          active ? 'border-red-600 bg-red-600 text-white shadow-lg shadow-red-600/30' : palette.iconCircle
        }`}
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <span
        className={`max-w-[7rem] truncate text-xs ${active ? `font-bold ${palette.heading}` : `font-medium ${palette.body}`}`}
      >
        {label}
      </span>
      <span
        className={`absolute bottom-0 left-1/2 h-0.5 w-10 -translate-x-1/2 rounded-full bg-red-600 transition-opacity ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden
      />
    </button>
  );
}

function CategorySection({
  category,
  palette,
  isClosed,
  showViewOnly,
  onViewOnly,
  onAdd,
  getQuantity,
  isJustAdded,
}: {
  category: Category;
  palette: MenuPalette;
  isClosed: boolean;
  showViewOnly: boolean;
  onViewOnly: () => void;
  onAdd: (item: MenuItem) => void;
  getQuantity: (id: string) => number;
  isJustAdded: (id: string) => boolean;
}) {
  const Icon = getCategoryIcon(category.name);
  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className={`font-display text-2xl font-black uppercase tracking-tight md:text-3xl ${palette.heading}`}>
            {category.name}
          </h2>
          <p className={`text-sm ${palette.muted}`}>
            {category.items.length} {category.items.length === 1 ? 'opción' : 'opciones'}
          </p>
        </div>
        {showViewOnly && (
          <button
            type="button"
            onClick={onViewOnly}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-red-600 hover:underline"
          >
            Ver solo esta <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {category.items.length === 0 ? (
        <p className={`text-sm italic ${palette.muted}`}>No hay platos disponibles en esta categoría.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {category.items.map((item) => (
            <ProductCard
              key={item.id}
              item={item}
              fallbackIcon={Icon}
              palette={palette}
              isClosed={isClosed}
              quantity={getQuantity(item.id)}
              justAdded={isJustAdded(item.id)}
              onAdd={() => onAdd(item)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ProductCard({
  item,
  fallbackIcon: FallbackIcon,
  palette,
  isClosed,
  quantity,
  justAdded,
  onAdd,
}: {
  item: MenuItem;
  fallbackIcon: React.ElementType;
  palette: MenuPalette;
  isClosed: boolean;
  quantity: number;
  justAdded: boolean;
  onAdd: () => void;
}) {
  const isSoldOut = !item.isAvailable;
  const disabled = isSoldOut || isClosed;

  return (
    <article
      className={`group flex flex-row overflow-hidden rounded-2xl border sm:flex-col transition-all duration-300 ${palette.surface} ${
        isSoldOut ? '' : `${palette.surfaceHover} hover:-translate-y-0.5`
      }`}
    >
      <div className={`relative w-28 shrink-0 overflow-hidden sm:h-44 sm:w-full ${palette.imageBg}`}>
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- imágenes de platos en dominios arbitrarios
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${
              isSoldOut ? 'grayscale' : ''
            }`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FallbackIcon className={`h-10 w-10 sm:h-16 sm:w-16 transition-transform duration-500 group-hover:scale-110 ${palette.placeholderIcon}`} strokeWidth={1.25} />
          </div>
        )}

        {isSoldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45">
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] sm:px-4 sm:py-1.5 sm:text-xs font-black uppercase tracking-wider text-zinc-950 shadow-lg">
              Agotado
            </span>
          </div>
        )}
        {quantity > 0 && (
          <span className="absolute right-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] sm:right-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-[11px] font-bold text-white shadow-lg">
            {quantity} en tu pedido
          </span>
        )}
      </div>

      <div className={`flex min-w-0 flex-1 flex-col p-3.5 sm:p-4 ${isSoldOut ? 'opacity-60' : ''}`}>
        <h3 className={`text-base font-bold leading-snug ${palette.heading}`}>{item.name}</h3>
        {item.description && <p className={`mt-1 line-clamp-2 text-sm ${palette.muted}`}>{item.description}</p>}

        <div className="mt-auto flex items-center justify-between gap-2 pt-3 sm:gap-3 sm:pt-4">
          <p
            className={`whitespace-nowrap font-display text-base font-black sm:text-lg ${isSoldOut ? `line-through ${palette.muted}` : palette.heading}`}
          >
            {formatPrice(item.price)}
          </p>
          <button
            type="button"
            onClick={onAdd}
            disabled={disabled}
            aria-label={isSoldOut ? `${item.name} agotado` : `Agregar ${item.name}`}
            className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition sm:gap-1.5 sm:px-3.5 sm:py-2 sm:text-sm ${
              disabled
                ? 'cursor-not-allowed bg-zinc-500/15 text-zinc-500'
                : justAdded
                  ? 'scale-105 bg-emerald-500 text-white'
                  : 'bg-red-600 text-white shadow-md shadow-red-600/25 hover:bg-red-700 active:scale-95'
            }`}
          >
            {!disabled && !justAdded && <Plus className="h-4 w-4" />}
            {isSoldOut ? 'Sin stock' : isClosed ? 'Cerrado' : justAdded ? '¡Listo!' : 'Agregar'}
          </button>
        </div>
      </div>
    </article>
  );
}

function InfoRow({
  icon: Icon,
  title,
  palette,
  children,
}: {
  icon: React.ElementType;
  title: string;
  palette: MenuPalette;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
        <Icon className="h-5 w-5" />
      </span>
      <div className={`flex min-w-0 flex-col text-sm ${palette.body}`}>
        <span className={`font-bold ${palette.heading}`}>{title}</span>
        {children}
      </div>
    </li>
  );
}

function EmptyState({ title, action, palette }: { title: string; action?: React.ReactNode; palette: MenuPalette }) {
  return (
    <div className={`flex flex-col items-center gap-3 rounded-3xl border px-6 py-16 text-center ${palette.softSurface}`}>
      <ChefHat className={`h-10 w-10 ${palette.placeholderIcon}`} strokeWidth={1.5} />
      <p className={`text-sm font-semibold ${palette.heading}`}>{title}</p>
      {action}
    </div>
  );
}
