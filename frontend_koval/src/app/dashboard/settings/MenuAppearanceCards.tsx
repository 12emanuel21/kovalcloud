'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  MENU_COLOR_MODES,
  MENU_THEMES,
  isHexColor,
  resolveMenuColorMode,
  resolveMenuFont,
  resolveMenuLayout,
  resolveMenuTheme,
  type MenuColorMode,
  type MenuFont,
  type MenuLayout,
  type MenuTheme,
} from '@/lib/menu-themes';
import { MenuThemePicker } from './MenuThemePicker';
import { MenuLayoutPicker } from './MenuLayoutPicker';
import { AccentColorPicker, MenuFontSelect } from './BrandControls';
import { BannerField } from './BannerField';
import {
  SettingsCardFooter,
  SettingsCardHeader,
  SettingsFeedback,
  primaryButtonClass,
  settingsCardClass,
  settingsHintClass,
  settingsInputClass,
  settingsLabelClass,
} from './settings-ui';
import { useRestaurantPatch, type RestaurantSettings } from './useRestaurantSettings';

type Feedback = { type: 'success' | 'error'; text: string } | null;

interface CardProps {
  restaurant: RestaurantSettings;
  onSaved: (saved: Partial<RestaurantSettings>) => void;
}

const normalizeSlug = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '-');

/** Diseño de la carta pública: portada, tema, modo, color, tipografía y estructura (PATCH /restaurants/:id) */
export function MenuAppearanceCard({ restaurant, onSaved }: CardProps) {
  const { restaurantId, token } = useAuth();
  const patchRestaurant = useRestaurantPatch();

  const [bannerUrl, setBannerUrl] = useState(restaurant.bannerUrl ?? '');
  // La portada subida se guarda en el acto (POST /banner): se refleja en la página sin esperar al botón
  const uploadedBanner = useRef<string | null>(null);
  const [theme, setTheme] = useState<MenuTheme>(() => resolveMenuTheme(restaurant.theme));
  // Modo con el que abre la carta (el cliente luego lo cambia con ☀️/🌙)
  const [menuColorMode, setMenuColorMode] = useState<MenuColorMode>(() =>
    resolveMenuColorMode(restaurant.menuColorMode, restaurant.theme),
  );
  const [layout, setLayout] = useState<MenuLayout>(() => resolveMenuLayout(restaurant.layout));
  // Color de acento libre (null = el del tema) y tipografía
  const [customColor, setCustomColor] = useState<string | null>(() =>
    isHexColor(restaurant.customColor) ? restaurant.customColor.toLowerCase() : null,
  );
  const [fontFamily, setFontFamily] = useState<MenuFont>(() => resolveMenuFont(restaurant.fontFamily));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const selectedTheme = MENU_THEMES.find((t) => t.value === theme) ?? MENU_THEMES[0];
  const swatch = selectedTheme.swatches[menuColorMode];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await patchRestaurant(
        // "" = quitar la portada (el backend la deja en null)
        { bannerUrl: bannerUrl.trim(), theme, menuColorMode, layout, customColor, fontFamily },
        'No se pudo guardar la apariencia de la carta',
      );
      onSaved({
        bannerUrl: saved.bannerUrl,
        theme: saved.theme,
        menuColorMode: saved.menuColorMode,
        layout: saved.layout,
        customColor: saved.customColor,
        fontFamily: saved.fontFamily,
      });
      setFeedback({ type: 'success', text: 'Apariencia guardada: ya se ve en tu carta.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo guardar la apariencia de la carta' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className={settingsCardClass}>
      <SettingsCardHeader
        title="Diseño de la carta"
        description="Cómo ven tu carta los clientes al abrir el enlace o escanear el QR."
        action={
          restaurant.slug ? (
            <Link
              href={`/menu/${restaurant.slug}`}
              target="_blank"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 transition hover:border-emerald-500/40 hover:text-emerald-300"
            >
              Ver mi carta
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null
        }
      />
      <div className="space-y-6 p-6">
        <SettingsFeedback feedback={feedback} />

        <BannerField
          restaurantId={restaurantId}
          token={token}
          value={bannerUrl}
          onChange={(url) => {
            uploadedBanner.current = url;
            setBannerUrl(url);
          }}
          onUploaded={() => {
            if (uploadedBanner.current) onSaved({ bannerUrl: uploadedBanner.current });
            setFeedback({ type: 'success', text: 'Portada actualizada: ya se ve en tu carta.' });
          }}
          disabled={saving}
        />

        <div>
          <span className={settingsLabelClass}>Tema visual</span>
          <MenuThemePicker value={theme} onChange={setTheme} mode={menuColorMode} disabled={saving} />
        </div>

        <div>
          <span id="menu-color-mode-label" className={settingsLabelClass}>
            Modo al abrir la carta
          </span>
          <div role="radiogroup" aria-labelledby="menu-color-mode-label" className="inline-flex gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
            {MENU_COLOR_MODES.map((option) => {
              const selected = option.value === menuColorMode;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={saving}
                  onClick={() => setMenuColorMode(option.value)}
                  className={`min-h-10 rounded-md px-3 text-sm font-semibold transition disabled:opacity-60 ${
                    selected ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {option.icon} {option.label}
                </button>
              );
            })}
          </div>
          <p className={settingsHintClass}>Cada cliente puede cambiarlo con el botón ☀️/🌙 de la carta.</p>
        </div>

        <div>
          <span className={settingsLabelClass}>Color de acento</span>
          <AccentColorPicker
            value={customColor}
            onChange={setCustomColor}
            themeAccent={swatch.primary}
            background={swatch.bg}
            disabled={saving}
          />
        </div>

        <div>
          <span className={settingsLabelClass}>Tipografía</span>
          <MenuFontSelect value={fontFamily} onChange={setFontFamily} restaurantName={restaurant.name} disabled={saving} />
        </div>

        <div>
          <span className={settingsLabelClass}>Estructura del menú</span>
          <MenuLayoutPicker
            value={layout}
            onChange={setLayout}
            swatch={{ ...swatch, primary: customColor ?? swatch.primary }}
            radius={selectedTheme.radius}
            disabled={saving}
          />
        </div>
      </div>
      <SettingsCardFooter hint="Se aplica en tu carta al guardar.">
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? 'Guardando...' : 'Guardar apariencia'}
        </button>
      </SettingsCardFooter>
    </form>
  );
}

/**
 * Enlace de la carta (slug) y moneda. Cambiar el enlace rompe los QR ya impresos: se confirma antes.
 * PATCH /restaurants/:id solo con estos dos campos.
 */
export function MenuLinkCard({ restaurant, onSaved }: CardProps) {
  const patchRestaurant = useRestaurantPatch();
  const [slug, setSlug] = useState(restaurant.slug ?? '');
  const [currency, setCurrency] = useState(restaurant.currency || 'COP');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const nextSlug = normalizeSlug(slug);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nextSlug) {
      setFeedback({ type: 'error', text: 'El enlace de la carta no puede quedar vacío.' });
      return;
    }
    if (
      nextSlug !== restaurant.slug &&
      !window.confirm(
        `¿Cambiar el enlace de tu carta a /menu/${nextSlug}? El enlace anterior y los códigos QR ya impresos dejarán de funcionar.`,
      )
    ) {
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await patchRestaurant({ slug: nextSlug, currency }, 'No se pudo guardar el enlace de la carta');
      setSlug(saved.slug);
      onSaved({ slug: saved.slug, currency: saved.currency });
      setFeedback({ type: 'success', text: 'Enlace y moneda guardados.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo guardar el enlace de la carta' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className={settingsCardClass}>
      <SettingsCardHeader title="Enlace de tu carta y moneda" description="La dirección web de tu carta y la moneda de tus precios." />
      <div className="grid grid-cols-1 gap-5 p-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <SettingsFeedback feedback={feedback} />
        </div>
        <label className="block">
          <span className={settingsLabelClass}>Enlace de la carta</span>
          <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-800 bg-slate-950 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
            <span className="flex items-center border-r border-slate-800 px-3 font-mono text-xs text-slate-500">/menu/</span>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="pizzeria-napoles"
              required
              spellCheck={false}
              autoCapitalize="none"
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-sm text-emerald-400 outline-none"
            />
          </div>
          <span className={`block ${settingsHintClass}`}>Si lo cambias, vuelve a imprimir tus códigos QR.</span>
        </label>
        <label className="block">
          <span className={settingsLabelClass}>Moneda</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={settingsInputClass}>
            <option value="COP">COP ($ Pesos colombianos)</option>
            <option value="USD">USD ($ Dólares estadounidenses)</option>
            <option value="MXN">MXN ($ Pesos mexicanos)</option>
            <option value="EUR">EUR (€ Euros)</option>
          </select>
        </label>
      </div>
      <SettingsCardFooter>
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? 'Guardando...' : 'Guardar enlace y moneda'}
        </button>
      </SettingsCardFooter>
    </form>
  );
}
