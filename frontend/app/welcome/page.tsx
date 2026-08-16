'use client';

/**
 * The original landing page, kept at /welcome.
 *
 * `/` now goes straight to the marketplace: a marketplace's front door is its
 * catalog, not a sign-up wall. This page stays reachable for campaigns and for
 * anyone who wants the pitch rather than the products.
 */
import Link from 'next/link';
import { ArrowRight, Flame, MapPin, Bike, Store, ShoppingBag } from 'lucide-react';
import { useT, LangToggle } from '../../lib/i18n';

export default function Welcome() {
  const { t } = useT();

  return (
    <main className="relative min-h-screen overflow-hidden text-white bg-grad-hero">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-24 h-[60vmax] w-[60vmax] rounded-full" style={{ background: 'radial-gradient(circle, rgba(241,90,36,.45), transparent 60%)', filter: 'blur(90px)' }} />
        <div className="absolute -bottom-40 -right-24 h-[55vmax] w-[55vmax] rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,177,0,.30), transparent 60%)', filter: 'blur(90px)' }} />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col px-6 pb-10 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-grad-brand shadow-ds-btn"><Flame size={20} /></span>
            <span className="text-lg font-extrabold tracking-tight">JIKO CONNECT</span>
          </div>
          <div className="flex items-center gap-2">
            <LangToggle />
            <Link href="/auth/login" className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium">{t('Sign in', 'Ingia')}</Link>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs text-white/80">
            <span className="h-2 w-2 rounded-full bg-leaf-light" /> {t('Buy anything · delivered', 'Nunua chochote · kiletwe')}
          </span>
          <h1 className="mt-5 text-[42px] font-extrabold leading-[1.05] tracking-tight">
            {t('Anything you need,', 'Chochote unachohitaji,')}<br />{t('delivered to your', 'kiletwe')} <span className="bg-grad-brand bg-clip-text text-transparent">{t('door', 'mlangoni')}</span>.
          </h1>
          <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-white/70">
            {t('Browse sellers near you and far, compare prices, order, and track it to your door.', 'Vinjari wauzaji walio karibu na mbali, linganisha bei, agiza, na fuatilia hadi mlangoni.')}
          </p>

          <div className="mt-7 grid w-full grid-cols-3 gap-2.5 text-center">
            {[
              { icon: <MapPin size={18} />, label: t('Buyers', 'Wanunuzi') },
              { icon: <Store size={18} />,  label: t('Sellers', 'Wauzaji') },
              { icon: <Bike size={18} />,   label: t('Transporters', 'Wasafirishaji') },
            ].map((x) => (
              <div key={x.label} className="rounded-2xl border border-white/10 bg-white/5 py-3">
                <div className="mx-auto mb-1 grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-flame-light">{x.icon}</div>
                <div className="text-xs text-white/75">{x.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <Link href="/shop" className="flex w-full max-w-sm items-center justify-center gap-2 rounded-full bg-grad-brand px-7 py-4 text-base font-bold text-white shadow-ds-btn">
            <ShoppingBag size={18} strokeWidth={2.2} />
            {t('Browse the marketplace', 'Vinjari soko')}
          </Link>
          <Link href="/auth/register" className="flex w-full max-w-sm items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white">
            {t('Create an account', 'Fungua akaunti')} <ArrowRight size={17} strokeWidth={2.2} />
          </Link>
        </div>
      </div>
    </main>
  );
}
