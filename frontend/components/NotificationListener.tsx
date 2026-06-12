'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { getAccessToken } from '../lib/api';
import { useSocket } from '../lib/useSocket';
import { playAlert, primeAudio } from '../lib/sound';

// Global: every live notification (order, payment, pickup, delivery, KYC…) plays
// a chime + shows a toast for whichever party it's sent to.
export function NotificationListener() {
  const { on } = useSocket(getAccessToken());

  useEffect(() => {
    // Browsers block audio until the user interacts — unlock on the first tap.
    const unlock = () => { primeAudio(); window.removeEventListener('pointerdown', unlock); };
    window.addEventListener('pointerdown', unlock);

    const off = on('notification', (n: any) => {
      playAlert();
      toast(
        <div className="text-sm">
          <div className="font-semibold">{n?.title ?? 'JIKO CONNECT'}</div>
          {n?.body && <div className="text-xs opacity-80">{n.body}</div>}
        </div>,
        { icon: '🔔', duration: 5000 },
      );
    });
    return () => { off?.(); window.removeEventListener('pointerdown', unlock); };
  }, [on]);

  return null;
}
