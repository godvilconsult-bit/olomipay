'use client';

import { useEffect, useState } from 'react';
import { MapPin, X, AlertTriangle } from 'lucide-react';
import { useT } from '../lib/i18n';
import { ensureLocationPermission, getDeviceLocation } from '../lib/location';

type State = 'hidden' | 'ask' | 'denied' | 'unavailable';

const isIOS = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
async function isNative() {
  try { const core: any = await import('@capacitor/core'); return !!core?.Capacitor?.isNativePlatform?.(); } catch { return false; }
}

export function LocationPrompt() {
  const { t } = useT();
  const [state, setState] = useState<State>('hidden');
  const [help, setHelp]   = useState(false);

  useEffect(() => {
    (async () => {
      // Native app: request the OS permission straight away (prompt on default,
      // like every other map app). If granted we stay hidden; otherwise guide.
      if (await isNative()) {
        const granted = await ensureLocationPermission();
        setState(granted ? 'hidden' : 'denied');
        return;
      }
      // Browser: read the Permissions API to decide whether to show "Allow".
      if (typeof navigator === 'undefined' || !navigator.geolocation) { setState('unavailable'); return; }
      const anyNav = navigator as any;
      if (anyNav.permissions?.query) {
        anyNav.permissions.query({ name: 'geolocation' }).then((p: any) => {
          setState(p.state === 'granted' ? 'hidden' : p.state === 'denied' ? 'denied' : 'ask');
          p.onchange = () => setState(p.state === 'granted' ? 'hidden' : p.state === 'denied' ? 'denied' : 'ask');
        }).catch(() => setState('ask'));
      } else {
        setState('ask');
      }
    })();
  }, []);

  async function request() {
    try {
      await ensureLocationPermission();
      await getDeviceLocation();   // triggers the browser prompt on web
      setState('hidden');
    } catch {
      setState('denied');
    }
  }

  if (state === 'hidden') return null;

  return (
    <div className="fixed inset-x-0 bottom-[88px] z-40 mx-auto max-w-md px-5">
      <div className="rounded-2xl bg-ink p-3 text-white shadow-ds-card">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-flame/20 text-flame">{state === 'denied' ? <AlertTriangle size={18} /> : <MapPin size={18} />}</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{state === 'denied' ? t('Location is blocked', 'Eneo limezuiwa') : t('Turn on location', 'Washa eneo')}</div>
            <div className="text-xs text-white/70">{state === 'denied' ? t('Enable it in your browser/phone settings to find vendors near you.', 'Liwashe kwenye mipangilio kupata wauzaji karibu.') : t('Needed to find nearby vendors and track delivery.', 'Inahitajika kupata wauzaji na kufuatilia.')}</div>
          </div>
          {state === 'ask'
            ? <button onClick={request} className="flex-shrink-0 rounded-full bg-flame px-3.5 py-2 text-xs font-bold">{t('Allow', 'Ruhusu')}</button>
            : <button onClick={() => setHelp((h) => !h)} className="flex-shrink-0 rounded-full bg-white/15 px-3 py-2 text-xs font-bold">{t('How', 'Vipi')}</button>}
          <button onClick={() => setState('hidden')} className="flex-shrink-0 text-white/40"><X size={16} /></button>
        </div>
        {(help || state === 'denied') && (
          <div className="mt-2 border-t border-white/10 pt-2 text-xs text-white/70">
            {isIOS()
              ? t('iPhone: Settings → Privacy & Security → Location Services → ON, then your browser → "While Using". Reload the app.', 'iPhone: Settings → Privacy → Location Services → ON, kisha browser → "While Using". Pakia upya.')
              : t('Android: tap the lock/ⓘ in the address bar → Permissions → Location → Allow. Or Settings → Apps → your browser → Location. Reload.', 'Android: gusa kufuli kwenye address bar → Permissions → Location → Allow. Pakia upya.')}
          </div>
        )}
      </div>
    </div>
  );
}
