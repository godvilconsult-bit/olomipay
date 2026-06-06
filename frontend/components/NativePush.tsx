'use client';

import { useEffect } from 'react';

/**
 * NativePush — registers the device for native push (FCM/APNs) when the web app
 * is running inside the Capacitor iOS/Android shell. On the plain website it does
 * nothing (web push is handled separately by PushRegistrar).
 *
 * Flow: detect native → request permission → register → send the FCM/APNs token
 * to the backend (/api/notifications/register-device) → handle notification taps.
 */
export default function NativePush() {
  useEffect(() => {
    (async () => {
      let Capacitor: any;
      try { ({ Capacitor } = await import('@capacitor/core')); } catch { return; }
      if (!Capacitor?.isNativePlatform?.()) return; // web → do nothing

      const token = localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt');
      if (!token) return; // only register once the user is logged in

      let PushNotifications: any;
      try { ({ PushNotifications } = await import('@capacitor/push-notifications')); } catch { return; }

      // Permission
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive !== 'granted') return;

      // Android 8+: notifications are SILENT unless delivered via a HIGH-importance
      // channel. Create one (importance 5 = heads-up + default sound + vibrate).
      if (Capacitor.getPlatform() === 'android') {
        try {
          await PushNotifications.createChannel({
            id:          'olomipay_default',
            name:        'OlomiPay alerts',
            description: 'Money and chat notifications',
            importance:  5,   // HIGH — pop-up + sound
            visibility:  1,
            vibration:   true,
          });
        } catch { /* older Android / already exists */ }
      }

      // Send the device token to the backend so it can push to this phone
      await PushNotifications.addListener('registration', async (t: { value: string }) => {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/register-device`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ token: t.value, platform: Capacitor.getPlatform() }),
        }).catch(() => {});
      });

      await PushNotifications.addListener('registrationError', (e: any) =>
        console.warn('[push] registration error', e?.error));

      // Tapping a notification opens the relevant screen
      await PushNotifications.addListener('pushNotificationActionPerformed', (action: any) => {
        const data = action?.notification?.data ?? {};
        if (data.conversationId)      window.location.href = `/chat/${data.conversationId}`;
        else if (data.type === 'money_in' || data.type === 'money_out') window.location.href = '/history';
        else if (data.type === 'payment_request') window.location.href = '/chat';
      });

      await PushNotifications.register();
    })().catch(() => {});
  }, []);

  return null;
}
