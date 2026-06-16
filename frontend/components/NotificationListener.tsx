'use client';

import { useEffect, useState, useCallback } from 'react';
import { getAccessToken } from '../lib/api';
import { useSocket } from '../lib/useSocket';
import { useT } from '../lib/i18n';
import { playAlert, primeAudio } from '../lib/sound';
import { registerPush } from '../lib/push';

type Note = { title: string; body?: string; type?: string };

// Global confirmation popup. Every live event between the parties to a
// transaction (order placed, fee confirmed, rider assigned, picked up, arrived,
// delivered, KYC, payment…) arrives as a `notification` socket event and is
// shown as a centred modal that BLOCKS until the user taps to confirm. Multiple
// events queue up and are acknowledged one at a time, so nothing is missed.
export function NotificationListener() {
  const { on } = useSocket(getAccessToken());
  const { t } = useT();
  const [queue, setQueue] = useState<Note[]>([]);

  useEffect(() => {
    // Browsers block audio until the user interacts — unlock on the first tap,
    // and use that same gesture to register for background push notifications.
    const unlock = () => { primeAudio(); registerPush(); window.removeEventListener('pointerdown', unlock); };
    window.addEventListener('pointerdown', unlock);

    const off = on('notification', (n: any) => {
      playAlert();
      setQueue((q) => [...q, { title: n?.title ?? 'JIKO CONNECT', body: n?.body, type: n?.type }]);
    });
    return () => { off?.(); window.removeEventListener('pointerdown', unlock); };
  }, [on]);

  const current = queue[0];
  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 px-6 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm animate-[popIn_.18s_ease-out] rounded-3xl bg-white p-6 text-center shadow-2xl dark:bg-ink-2">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-flame/15 text-2xl">🔔</div>
        <div className="text-lg font-extrabold leading-tight">{current.title}</div>
        {current.body && <div className="mt-1.5 text-sm text-ink/60 dark:text-sand/60">{current.body}</div>}

        <button onClick={dismiss} className="mt-5 w-full rounded-2xl bg-grad-brand py-3.5 text-base font-bold text-white shadow-ds-btn transition active:scale-[.99]">
          {t('OK, got it', 'Sawa, nimeelewa')}
        </button>
        {queue.length > 1 && <div className="mt-2 text-xs text-ink/40">+{queue.length - 1} {t('more', 'zaidi')}</div>}
      </div>
    </div>
  );
}
