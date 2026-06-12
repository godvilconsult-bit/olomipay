'use client';

import { ReactNode } from 'react';
import { MapPin, ShieldAlert, Loader2, RefreshCw, Navigation, Lock } from 'lucide-react';
import { useT } from '../lib/i18n';
import { useLocationPermission, type DeviceInfo } from '../lib/useLocationPermission';

/** Device/browser-specific "how to re-enable location" steps (EN/SW). */
function reEnableSteps(d: DeviceInfo, t: (en: string, sw: string) => string): string[] {
  if (d.isNative) return [
    t('Open your phone Settings → Apps → JIKO CONNECT.', 'Fungua Mipangilio → Programu (Apps) → JIKO CONNECT.'),
    t('Tap Permissions → Location → Allow (While using).', 'Gusa Ruhusa → Mahali (Location) → Ruhusu.'),
    t('Return here and tap Retry.', 'Rudi hapa kisha gusa Jaribu tena.'),
  ];
  if (d.os === 'ios') return [
    t('iPhone Settings → Privacy & Security → Location Services → ON.', 'Mipangilio → Privacy & Security → Location Services → WASHA.'),
    d.isPWA
      ? t('Settings → JIKO CONNECT → Location → While Using the App.', 'Mipangilio → JIKO CONNECT → Location → While Using.')
      : t('Settings → Safari → Location → Allow. Then reload this page.', 'Mipangilio → Safari → Location → Allow. Kisha pakia upya.'),
    t('Come back and tap Retry.', 'Rudi kisha gusa Jaribu tena.'),
  ];
  if (d.os === 'android') return [
    d.isPWA || d.browser === 'samsung'
      ? t('Phone Settings → Apps → JIKO CONNECT → Permissions → Location → Allow.', 'Mipangilio → Apps → JIKO CONNECT → Ruhusa → Location → Allow.')
      : t('Tap the lock 🔒 in the address bar → Permissions → Location → Allow.', 'Gusa kufuli 🔒 kwenye address bar → Permissions → Location → Allow.'),
    t('Or Settings → Apps → your browser → Permissions → Location.', 'Au Mipangilio → Apps → browser yako → Location.'),
    t('Then tap Retry below.', 'Kisha gusa Jaribu tena hapa chini.'),
  ];
  // Desktop
  return [
    t('Click the lock 🔒 (or location pin) on the left of the address bar.', 'Bofya kufuli 🔒 kushoto ya address bar.'),
    t('Set Location to Allow for this site.', 'Weka Location kuwa Allow kwa tovuti hii.'),
    t('Then tap Retry.', 'Kisha bofya Jaribu tena.'),
  ];
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-sand px-6 py-10">
      <div className="w-full max-w-sm text-center">{children}</div>
    </div>
  );
}

/**
 * Hard gate for map / live-tracking features. Renders `children` only once the
 * device has granted location permission; otherwise it takes over the screen
 * with a clear prompt / denied-instructions / retry flow. Mobile-first.
 *
 * Pass `softFallback` to render something (e.g. a limited view) instead of
 * blocking — used for roles that can still do a little without GPS.
 */
export function LocationGate({ children, softFallback }: { children: ReactNode; softFallback?: ReactNode }) {
  const { t } = useT();
  const { status, device, error, requesting, request, retry } = useLocationPermission();

  if (status === 'granted') return <>{children}</>;

  if (status === 'checking') {
    return <Shell><Loader2 className="mx-auto animate-spin text-flame" size={34} /><p className="mt-4 text-sm text-ink/60">{t('Checking location…', 'Inakagua eneo…')}</p></Shell>;
  }

  if (status === 'unsupported') {
    const insecure = !device.isNative && !device.isSecure;
    return (
      <Shell>
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-warning/15 text-warning"><Lock size={30} /></span>
        <h1 className="mt-4 text-xl font-extrabold">{insecure ? t('Secure connection needed', 'Muunganisho salama unahitajika') : t('Location not supported', 'Eneo halipatikani')}</h1>
        <p className="mt-2 text-sm text-ink/60">
          {insecure
            ? t('Location only works over a secure (https) connection. Open the app from its official https link.', 'Eneo hufanya kazi kwenye muunganisho salama (https) pekee. Fungua programu kupitia kiungo rasmi cha https.')
            : t('This browser does not provide location. Try Chrome or Safari, or install the app.', 'Browser hii haitoi eneo. Tumia Chrome au Safari, au sakinisha programu.')}
        </p>
        {softFallback && <div className="mt-6">{softFallback}</div>}
      </Shell>
    );
  }

  const denied = status === 'denied';
  return (
    <Shell>
      <span className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl ${denied ? 'bg-flame/15 text-flame' : 'bg-grad-leaf text-white'}`}>
        {denied ? <ShieldAlert size={30} /> : <MapPin size={30} />}
      </span>
      <h1 className="mt-4 text-xl font-extrabold">{denied ? t('Location is blocked', 'Eneo limezuiwa') : t('Enable location', 'Washa eneo')}</h1>
      <p className="mt-2 text-sm text-ink/60">
        {t(
          'This app requires location access to connect households, suppliers, and riders and to provide live delivery tracking.',
          'Programu hii inahitaji ruhusa ya eneo ili kuunganisha kaya, wauzaji na madereva na kutoa ufuatiliaji wa moja kwa moja wa usafirishaji.',
        )}
      </p>

      {denied && (
        <div className="mt-5 rounded-2xl border border-black/10 bg-white p-4 text-left">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/40">{t('How to turn it back on', 'Jinsi ya kuliwasha tena')}</div>
          <ol className="space-y-1.5 text-sm text-ink/70">
            {reEnableSteps(device, t).map((s, i) => (
              <li key={i} className="flex gap-2"><span className="font-bold text-flame">{i + 1}.</span><span>{s}</span></li>
            ))}
          </ol>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-flame">{error}</p>}

      <button
        onClick={denied ? retry : request}
        disabled={requesting}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-ds-xl bg-grad-brand py-4 text-base font-bold text-white shadow-ds-btn transition active:scale-[.99] disabled:opacity-60"
      >
        {requesting ? <Loader2 className="animate-spin" size={20} /> : denied ? <RefreshCw size={20} /> : <Navigation size={20} />}
        {requesting ? t('Requesting…', 'Inaomba…') : denied ? t('Retry', 'Jaribu tena') : t('Enable Location', 'Washa Eneo')}
      </button>

      <p className="mt-3 text-xs text-ink/40">{t('Your location is only used to match orders and show live delivery.', 'Eneo lako hutumika kuunganisha oda na kuonyesha usafirishaji pekee.')}</p>
    </Shell>
  );
}
