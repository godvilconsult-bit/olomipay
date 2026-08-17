'use client';

/**
 * The buying call-to-action on a product page.
 *
 * Anyone can browse, but ordering needs an account, so a signed-out visitor
 * gets an explicit choice here rather than discovering the requirement only
 * after tapping buy. Both links carry `next`, so they come back to this exact
 * product once they are in.
 *
 * Signed-in visitors see nothing — the offer rows and the message button are
 * already their path forward, and another banner would be noise.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserPlus, LogIn } from 'lucide-react';
import { getAccessToken } from '../lib/api';
import { useT } from '../lib/i18n';

export default function BuyCta({ productId }: { productId: string }) {
  const { t } = useT();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => { setSignedIn(!!getAccessToken()); }, []);

  if (signedIn !== false) return null;

  const back = encodeURIComponent(`/shop/p/${productId}`);

  return (
    <div className="mt-4 rounded-ds-xl border border-flame/20 bg-flame/5 p-4">
      <div className="text-sm font-bold text-ink dark:text-sand">
        {t('Ready to order?', 'Tayari kuagiza?')}
      </div>
      <p className="mt-0.5 text-xs text-ink/60 dark:text-sand/60">
        {t('Create a free account to place an order, message the seller and track delivery.',
           'Fungua akaunti bure ili kuagiza, kuwasiliana na muuzaji na kufuatilia usafirishaji.')}
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Link
          href={`/auth/register?next=${back}`}
          className="inline-flex min-h-touch flex-1 items-center justify-center gap-1.5 rounded-2xl bg-grad-brand px-4 text-sm font-semibold text-white shadow-ds-btn"
        >
          <UserPlus size={16} /> {t('Create account', 'Fungua akaunti')}
        </Link>
        <Link
          href={`/auth/login?next=${back}`}
          className="inline-flex min-h-touch flex-1 items-center justify-center gap-1.5 rounded-2xl border border-flame/40 px-4 text-sm font-semibold text-flame"
        >
          <LogIn size={16} /> {t('Sign in', 'Ingia')}
        </Link>
      </div>
    </div>
  );
}
