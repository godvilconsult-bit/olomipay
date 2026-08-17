'use client';

/**
 * Header for the public storefront.
 *
 * The marketplace is the front door, so this is the only place an anonymous
 * visitor can find sign-in, account creation, or a way to start selling. The
 * app's other screens carry AppHeader/RoleNav, but those assume a logged-in
 * user and never render here.
 *
 * Auth state lives in localStorage, so the signed-in view is resolved after
 * mount. Until then the neutral (signed-out) markup renders — which is also
 * what a crawler sees, and it keeps server and client markup identical so
 * hydration does not warn.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Flame, LogIn, UserPlus, Store, MessageSquare, LayoutDashboard } from 'lucide-react';
import { getAccessToken } from '../lib/api';
import { useT, LangToggle } from '../lib/i18n';
import { cn } from './ui';

export default function StoreHeader({ compact = false }: { compact?: boolean }) {
  const { t } = useT();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => { setSignedIn(!!getAccessToken()); }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-black/5 bg-sand/90 backdrop-blur dark:border-white/5 dark:bg-ink/90">
      <div className={cn('mx-auto flex items-center gap-2 px-4 py-2.5', compact ? 'max-w-4xl' : 'max-w-6xl')}>
        <Link href="/shop" className="flex shrink-0 items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-grad-brand text-white shadow-ds-btn">
            <Flame size={17} />
          </span>
          <span className="hidden text-base font-extrabold tracking-tight text-ink dark:text-sand sm:inline">
            JIKO CONNECT
          </span>
        </Link>

        <div className="flex-1" />

        <LangToggle />

        {signedIn ? (
          <>
            <Link
              href="/sell"
              className="inline-flex min-h-touch items-center gap-1.5 rounded-2xl px-3 text-sm font-semibold text-ink/70 hover:text-flame dark:text-sand/70"
            >
              <Store size={16} /> <span className="hidden sm:inline">{t('Sell', 'Uza')}</span>
            </Link>
            <Link
              href="/messages"
              aria-label={t('Messages', 'Ujumbe')}
              className="inline-flex min-h-touch items-center rounded-2xl px-2 text-ink/70 hover:text-flame dark:text-sand/70"
            >
              <MessageSquare size={18} />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex min-h-touch items-center gap-1.5 rounded-2xl bg-grad-brand px-3.5 text-sm font-semibold text-white shadow-ds-btn"
            >
              <LayoutDashboard size={16} /> <span className="hidden sm:inline">{t('Account', 'Akaunti')}</span>
            </Link>
          </>
        ) : (
          <>
            {/* Sellers need a door in too — a marketplace with no obvious way to
                list is only half a marketplace. */}
            <Link
              href="/auth/register?role=SUPPLIER"
              className="hidden min-h-touch items-center gap-1.5 rounded-2xl px-3 text-sm font-semibold text-ink/70 hover:text-flame dark:text-sand/70 sm:inline-flex"
            >
              <Store size={16} /> {t('Sell on JIKO', 'Uza JIKO')}
            </Link>
            <Link
              href="/auth/login"
              className="inline-flex min-h-touch items-center gap-1.5 rounded-2xl px-3 text-sm font-semibold text-ink/70 hover:text-flame dark:text-sand/70"
            >
              <LogIn size={16} /> {t('Sign in', 'Ingia')}
            </Link>
            <Link
              href="/auth/register"
              className="inline-flex min-h-touch items-center gap-1.5 rounded-2xl bg-grad-brand px-3.5 text-sm font-semibold text-white shadow-ds-btn"
            >
              <UserPlus size={16} /> <span className="hidden xs:inline">{t('Sign up', 'Jisajili')}</span>
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
