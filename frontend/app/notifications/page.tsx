'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bell, BellOff, CheckCheck } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import { timeAgo } from '../../lib/utils';

async function notifApi(path: string, body?: any) {
  const token = sessionStorage.getItem('olomipay_rt');
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications${path}`, {
    method:  body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const TYPE_ICON: Record<string, string> = {
  money_in:  '💚',
  money_out: '💸',
  low_balance: '⚠️',
  yield:     '🌱',
  scheduled: '🔄',
  failed:    '❌',
};

export default function NotificationsPage() {
  const router  = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    notifApi('/history').then(r => {
      if (r.success) setNotifications(r.data.notifications);
      setLoading(false);
    });
    // Check push permission
    if ('Notification' in window) {
      setPushEnabled(Notification.permission === 'granted');
    }
  }, []);

  async function enablePush() {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
    setPushEnabled(true);

    // Get VAPID key and subscribe
    const vapidRes = await notifApi('/vapid-key');
    if (!vapidRes.success) return;

    const sw = await navigator.serviceWorker.ready;
    const sub = await sw.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidRes.data.publicKey,
    });
    await notifApi('/subscribe', { endpoint: sub.endpoint, keys: { p256dh: '', auth: '' } });
  }

  async function markAllRead() {
    await notifApi('/read', {});
    setNotifications(ns => ns.map(n => ({ ...n, isRead: true })));
  }

  // Group by day
  const groups: Record<string, any[]> = {};
  for (const n of notifications) {
    const d = new Date(n.createdAt);
    const today     = new Date(); today.setHours(0,0,0,0);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const key = d >= today ? 'Today' : d >= yesterday ? 'Yesterday' : d.toLocaleDateString('en-TZ', { weekday: 'long', month: 'short', day: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-24">
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold flex-1">Notifications</h1>
        {notifications.some(n => !n.isRead) && (
          <button onClick={markAllRead} className="text-xs text-primary font-medium flex items-center gap-1 min-h-[32px] px-2">
            <CheckCheck size={14} /> All read
          </button>
        )}
      </div>

      <div className="px-5 max-w-md mx-auto mt-4 space-y-4">
        {/* Push enable banner */}
        {!pushEnabled && (
          <div className="card bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-3">
              <Bell size={20} className="text-primary flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-400">Enable notifications</p>
                <p className="text-xs text-blue-600/80 mt-0.5">Get instant alerts for money movements</p>
              </div>
              <button onClick={enablePush} className="text-xs bg-primary text-white px-3 py-2 rounded-xl font-medium min-h-[36px]">
                Enable
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="skeleton h-16 rounded-2xl" />)}
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-16">
            <BellOff size={40} className="text-slate-300 mx-auto mb-3" />
            <p className="font-medium text-slate-400">No notifications yet</p>
            <p className="text-xs text-slate-400 mt-1">We'll notify you about transactions</p>
          </div>
        ) : (
          Object.entries(groups).map(([day, items]) => (
            <div key={day}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 px-1">{day}</p>
              <div className="card divide-y divide-slate-100 dark:divide-slate-800">
                {items.map(n => (
                  <div key={n.id} className={`flex items-start gap-3 py-3 ${!n.isRead ? 'bg-blue-50/50 dark:bg-blue-900/10 -mx-5 px-5' : ''}`}>
                    <span className="text-xl flex-shrink-0 mt-0.5">
                      {TYPE_ICON[n.type] ?? '🔔'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!n.isRead ? 'font-semibold' : 'font-medium'} text-slate-800 dark:text-slate-200`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{n.body}</p>
                      <p className="text-xs text-slate-400 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.isRead && <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-2" />}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      <BottomNav />
    </div>
  );
}
