'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { TwoFactorSection } from '@/components/security/TwoFactorSection';
import { ShiftExtensionPanel } from '@/components/orders/ShiftExtensionPanel';
import { TeamSection } from './TeamSection';
import { MyAccountSection } from './MyAccountSection';
import { DriversSection } from './DriversSection';
import { DeliveryZonesSection } from './DeliveryZonesSection';
import { BranchesSection } from './BranchesSection';
import { CustomInstructionsCard } from './CustomInstructionsCard';
import { AddressPaymentsCard, LocalDataCard } from './LocalDataCards';
import { BusinessHoursCard, EmergencyCloseCard } from './ScheduleCards';
import { MenuAppearanceCard, MenuLinkCard } from './MenuAppearanceCards';
import { WhatsAppConnectionCard } from './WhatsAppConnectionCard';
import { WompiCard } from './WompiCard';
import { SettingsCardHeader, SettingsNav, parseSettingsTab, settingsCardClass, settingsTabLabel, type SettingsTab } from './settings-ui';
import { useRestaurantSettings, type RestaurantSettings } from './useRestaurantSettings';

function SettingsLoader() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
        <svg className="h-5 w-5 animate-spin text-emerald-400" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
      <p className="text-xs font-semibold text-slate-400">Cargando ajustes del restaurante...</p>
    </div>
  );
}

/** Ajustes: la sección activa vive en la URL (?tab=), así que se lee dentro de un Suspense */
export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsLoader />}>
      <SettingsScreen />
    </Suspense>
  );
}

function SettingsScreen() {
  const tab = parseSettingsTab(useSearchParams().get('tab'));
  const { restaurant, loading, error, applySaved } = useRestaurantSettings();

  if (loading) return <SettingsLoader />;

  const planName = restaurant?.plan?.name;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* El título lo muestra el TopBar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-400">Empieza por lo esencial; lo demás puedes configurarlo después.</p>
        {planName && (
          <span className="inline-flex w-fit items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
            {planName}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[14rem_minmax(0,1fr)] md:items-start">
        <div className="md:sticky md:top-0">
          <SettingsNav active={tab} />
        </div>

        <section aria-label={settingsTabLabel(tab)} className="min-w-0 space-y-6">
          {!restaurant ? (
            <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-300">
              {error ?? 'No se pudo cargar la configuración del restaurante.'}
            </div>
          ) : (
            // key: al cambiar de sección cada tarjeta arranca con los datos vigentes
            <SettingsSection key={tab} tab={tab} restaurant={restaurant} onSaved={applySaved} />
          )}
        </section>
      </div>
    </div>
  );
}

/** Tarjetas de cada sección. Cada una guarda solo sus campos: no hay validaciones cruzadas. */
function SettingsSection({
  tab,
  restaurant,
  onSaved,
}: {
  tab: SettingsTab;
  restaurant: RestaurantSettings;
  onSaved: (saved: Partial<RestaurantSettings>) => void;
}) {
  switch (tab) {
    case 'local':
      return (
        <>
          <LocalDataCard restaurant={restaurant} onSaved={onSaved} />
          <AddressPaymentsCard restaurant={restaurant} onSaved={onSaved} />
        </>
      );
    case 'horarios':
      return (
        <>
          {/* Tiempo extra del turno (+30 min, +1 h, Cerrar ahora) */}
          <ShiftExtensionPanel />
          <EmergencyCloseCard restaurant={restaurant} onSaved={onSaved} />
          <BusinessHoursCard restaurant={restaurant} onSaved={onSaved} />
        </>
      );
    case 'whatsapp':
      return <WhatsAppConnectionCard botNumber={restaurant.whatsappBotNumber} />;
    case 'domicilio':
      return <DeliveryZonesSection />;
    case 'repartidores':
      return <DriversSection />;
    case 'equipo':
      return <TeamSection />;
    case 'sedes':
      return <BranchesSection />;
    case 'apariencia':
      return (
        <>
          <MenuAppearanceCard restaurant={restaurant} onSaved={onSaved} />
          <MenuLinkCard restaurant={restaurant} onSaved={onSaved} />
        </>
      );
    case 'asistente':
      return <CustomInstructionsCard />;
    case 'pagos':
      return <WompiCard />;
    case 'seguridad':
      return (
        <>
          <TwoFactorSection />
          <MyAccountSection />
          <AccountInfoCard restaurant={restaurant} />
        </>
      );
  }
}

function AccountInfoCard({ restaurant }: { restaurant: RestaurantSettings }) {
  return (
    <section className={settingsCardClass}>
      <SettingsCardHeader title="Información de la cuenta" />
      <dl className="grid grid-cols-1 gap-4 p-6 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-slate-500">Correo del administrador</dt>
          <dd className="mt-0.5 font-semibold text-white">{restaurant.owner?.email ?? '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Código de tu local (para soporte)</dt>
          <dd className="mt-0.5 break-all font-mono text-xs text-emerald-400">{restaurant.id}</dd>
        </div>
      </dl>
    </section>
  );
}
