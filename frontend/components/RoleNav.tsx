'use client';

/**
 * Role navigation, in two shapes.
 *
 *   phone/tablet — a bottom tab bar, which holds about five items legibly
 *   desktop      — a labelled sidebar, which holds everything
 *
 * The bottom bar's five-item ceiling forced real features out of reach:
 * addresses, wallet, subscriptions, freight for sellers, store details. They are
 * all in the sidebar, so on a wide screen nothing is hidden, and on a phone the
 * overflow is reachable from the dashboard as before.
 *
 * The sidebar is fixed, so content needs a left offset. Rather than edit the
 * twenty-odd pages that render this component, it toggles a class on <body> that
 * global CSS keys off — scoped to exactly the pages that have a sidebar, and
 * leaving the public storefront (which has none) untouched.
 */
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, Package, MapPin, Bell, Store, Boxes, Bike, Wallet, ShieldCheck, Truck,
  Megaphone, ShoppingBag, PackagePlus, MessageSquare, Repeat, Cylinder, Settings,
  UserCheck, Receipt,
} from 'lucide-react';
import { Role } from '../lib/api';
import { useT } from '../lib/i18n';
import { cn } from './ui';

interface Item { href: string; label: string; icon: any }

export function RoleNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const { t } = useT();

  // Offset page content for the fixed sidebar, and clean up so the storefront
  // never inherits it.
  useEffect(() => {
    document.body.classList.add('has-sidenav');
    return () => document.body.classList.remove('has-sidenav');
  }, []);

  const common = {
    shop:     { href: '/shop',          label: t('Marketplace', 'Soko'),     icon: ShoppingBag },
    chat:     { href: '/messages',      label: t('Messages', 'Ujumbe'),      icon: MessageSquare },
    alerts:   { href: '/notifications', label: t('Alerts', 'Arifa'),         icon: Bell },
    wallet:   { href: '/wallet',        label: t('Wallet', 'Pochi'),         icon: Wallet },
    freight:  { href: '/freight',       label: t('Freight', 'Usafirishaji'), icon: Truck },
    kyc:      { href: '/kyc',           label: t('Verification', 'Uthibitisho'), icon: UserCheck },
  };

  /**
   * `primary` is the phone tab bar. `more` is everything else, shown in the
   * desktop sidebar — additive, so nothing that used to be reachable is lost.
   */
  const NAV: Record<Role, { primary: Item[]; more: Item[] }> = {
    HOUSEHOLD: {
      primary: [
        { href: '/dashboard', label: t('Home', 'Nyumbani'), icon: Home },
        common.shop,
        { href: '/orders', label: t('Orders', 'Oda'), icon: Package },
        common.chat,
        common.alerts,
      ],
      more: [
        { href: '/addresses',     label: t('Addresses', 'Anwani'),        icon: MapPin },
        { href: '/subscriptions', label: t('Auto-refill', 'Kujiandikisha'), icon: Repeat },
        { href: '/cylinders',     label: t('My cylinders', 'Mitungi yangu'), icon: Cylinder },
        common.wallet, common.kyc,
      ],
    },
    SUPPLIER: {
      primary: [
        { href: '/dashboard', label: t('Orders', 'Oda'), icon: Store },
        { href: '/sell',      label: t('Sell', 'Uza'),   icon: PackagePlus },
        common.chat, common.shop, common.alerts,
      ],
      more: [
        { href: '/sell/store',          label: t('Store details', 'Duka'),   icon: Settings },
        { href: '/supplier/inventory',  label: t('Gas stock', 'Gesi'),       icon: Boxes },
        { href: '/supplier/restock',    label: t('Restock', 'Ongeza'),       icon: Repeat },
        common.freight, common.wallet, common.kyc,
      ],
    },
    RIDER: {
      primary: [
        { href: '/dashboard',      label: t('Jobs', 'Kazi'),       icon: Bike },
        common.freight,
        { href: '/rider/earnings', label: t('Earnings', 'Mapato'), icon: Wallet },
        common.chat, common.alerts,
      ],
      more: [common.wallet, common.kyc],
    },
    DISTRIBUTOR: {
      primary: [
        { href: '/dashboard', label: t('Orders', 'Oda'), icon: Truck },
        { href: '/sell',      label: t('Sell', 'Uza'),   icon: PackagePlus },
        common.chat, common.shop, common.alerts,
      ],
      more: [
        { href: '/sell/store',        label: t('Store details', 'Duka'), icon: Settings },
        { href: '/distributor/stock', label: t('Gas stock', 'Gesi'),     icon: Boxes },
        common.freight, common.wallet, common.kyc,
      ],
    },
    BRAND: {
      primary: [
        { href: '/dashboard', label: t('Campaigns', 'Matangazo'), icon: Megaphone },
        common.shop, common.chat, common.alerts,
      ],
      more: [common.kyc],
    },
    ADMIN: {
      primary: [
        { href: '/dashboard', label: t('Dashboard', 'Dashibodi'), icon: ShieldCheck },
        common.shop, common.chat, common.alerts,
      ],
      more: [common.wallet],
    },
  };

  const { primary, more } = NAV[role] ?? NAV.HOUSEHOLD;
  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

  return (
    <>
      {/* ── Phone / tablet: bottom tab bar ───────────────────────────────── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/95 backdrop-blur lg:hidden dark:border-white/10 dark:bg-ink-2/95"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label={t('Main navigation', 'Menyu kuu')}
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2 py-1.5">
          {primary.map((tab) => {
            const active = isActive(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn('flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 transition',
                  active ? 'text-flame' : 'text-ink/45 dark:text-sand/45')}
              >
                <Icon size={21} strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Desktop: labelled sidebar with everything ────────────────────── */}
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-black/5 bg-white/80 px-3 py-4 backdrop-blur lg:flex dark:border-white/10 dark:bg-ink-2/80"
        aria-label={t('Main navigation', 'Menyu kuu')}
      >
        <Link href="/shop" className="mb-5 flex items-center gap-2 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-grad-brand text-white shadow-ds-btn">
            <Store size={18} />
          </span>
          <span className="text-[15px] font-extrabold tracking-tight text-ink dark:text-sand">JIKO CONNECT</span>
        </Link>

        <SideGroup items={primary} isActive={isActive} />

        {more.length > 0 && (
          <>
            <div className="mb-1.5 mt-5 px-3 text-[10px] font-bold uppercase tracking-wider text-ink/35 dark:text-sand/35">
              {t('More', 'Zaidi')}
            </div>
            <SideGroup items={more} isActive={isActive} />
          </>
        )}
      </aside>
    </>
  );
}

function SideGroup({ items, isActive }: { items: Item[]; isActive: (h: string) => boolean }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition',
              active
                ? 'bg-flame/10 text-flame'
                : 'text-ink/65 hover:bg-black/[0.04] hover:text-ink dark:text-sand/65 dark:hover:bg-white/5',
            )}
          >
            <Icon size={18} strokeWidth={active ? 2.4 : 2} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
