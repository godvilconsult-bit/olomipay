'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Flame, LogOut, Bell, User } from 'lucide-react';
import { auth, notifications } from '../lib/api';
import { LangToggle, useT } from '../lib/i18n';

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
    <Link href="/notifications" className="relative grid h-10 w-10 place-items-center rounded-full bg-white text-ink/60 shadow-ds-card">
      <Bell size={18} />
      {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-flame px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
}

export function AppHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const router = useRouter();
  const { t } = useT();
  const [menu, setMenu] = useState(false);
  async function logout() { try { await auth.logout(); } catch {} router.replace('/auth/login'); }

  return (
    <header className="sticky top-0 z-30 border-b border-black/5 bg-sand/85 backdrop-blur dark:border-white/5 dark:bg-background-dark/85">
      <div className="mx-auto flex max-w-md items-center justify-between px-5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-grad-brand text-white"><Flame size={18} /></span>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-extrabold leading-tight">{title}</div>
            {subtitle && <div className="truncate text-xs text-ink/50 dark:text-sand/50">{subtitle}</div>}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {right}
          <NotificationBell />
          <button onClick={() => setMenu((m) => !m)} className="grid h-10 w-10 place-items-center rounded-full bg-grad-brand text-white" aria-label={t('Account', 'Akaunti')}><User size={18} /></button>
        </div>
      </div>
      {menu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
          <div className="absolute right-5 top-[60px] z-40 w-56 rounded-2xl border border-black/5 bg-white p-3 shadow-ds-card dark:bg-ink-2">
            <div className="mb-1.5 flex items-center justify-between"><span className="text-xs font-semibold text-ink/50">{t('Language', 'Lugha')}</span><LangToggle /></div>
            <button onClick={logout} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-medium text-danger hover:bg-danger/5"><LogOut size={16} /> {t('Sign out', 'Toka')}</button>
          </div>
        </>
      )}
    </header>
  );
}
