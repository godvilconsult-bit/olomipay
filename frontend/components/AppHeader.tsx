'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Flame, LogOut, Bell } from 'lucide-react';
import { auth, notifications } from '../lib/api';
import { LangToggle } from '../lib/i18n';

function NotificationBell() {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => notifications.list().then((r) => { if (alive) setUnread(r.unread ?? 0); }).catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return (
    <Link href="/notifications" className="relative grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10 text-ink/60">
      <Bell size={17} />
      {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-flame px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
}

export function AppHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const router = useRouter();
  async function logout() {
    try { await auth.logout(); } catch {}
    router.replace('/auth/login');
  }
  return (
    <header className="sticky top-0 z-20 border-b border-black/5 dark:border-white/5 bg-sand/85 dark:bg-background-dark/85 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-grad-brand text-white"><Flame size={18} /></span>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-extrabold leading-tight">{title}</div>
            {subtitle && <div className="truncate text-xs text-ink/50 dark:text-sand/50">{subtitle}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {right}
          <LangToggle />
          <NotificationBell />
          <button onClick={logout} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 text-ink/60" aria-label="Logout"><LogOut size={17} /></button>
        </div>
      </div>
    </header>
  );
}
