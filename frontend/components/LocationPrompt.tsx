'use client';

import { useEffect, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { useT } from '../lib/i18n';

// Prompts the user to enable location (browsers + Android PWA). Tapping "Allow"
// triggers the native geolocation permission dialog.
export function LocationPrompt() {
  const { t } = useT();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    const anyNav = navigator as any;
    if (anyNav.permissions?.query) {
      anyNav.permissions.query({ name: 'geolocation' }).then((p: any) => {
        if (p.state !== 'granted') setShow(true);
        p.onchange = () => setShow(p.state !== 'granted');
      }).catch(() => setShow(true));
    } else {
      setShow(true);
    }
  }, []);

  function enable() {
    navigator.geolocation.getCurrentPosition(
      () => setShow(false),
      () => {/* denied — leave prompt so they can retry from settings */},
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  if (!show) return null;
  return (
    <div className="fixed inset-x-0 bottom-[88px] z-40 mx-auto max-w-md px-5">
      <div className="flex items-center gap-3 rounded-2xl bg-ink p-3 text-white shadow-ds-card">
        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-flame/20 text-flame"><MapPin size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{t('Turn on location', 'Washa eneo')}</div>
          <div className="text-xs text-white/70">{t('Needed to find nearby vendors and track delivery live.', 'Inahitajika kupata wauzaji na kufuatilia usafirishaji.')}</div>
        </div>
        <button onClick={enable} className="flex-shrink-0 rounded-full bg-flame px-3.5 py-2 text-xs font-bold">{t('Allow', 'Ruhusu')}</button>
        <button onClick={() => setShow(false)} className="flex-shrink-0 text-white/40"><X size={16} /></button>
      </div>
    </div>
  );
}
