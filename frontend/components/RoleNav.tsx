'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Package, MapPin, Bell, Store, Boxes, Bike, Wallet, ShieldCheck, Truck, Megaphone, ShoppingBag, PackagePlus, MessageSquare } from 'lucide-react';
import { Role } from '../lib/api';
import { useT } from '../lib/i18n';
import { cn } from './ui';

export function RoleNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const { t } = useT();

  const TABS: Record<Role, { href: string; label: string; icon: any }[]> = {
    // Every role that can buy gets the marketplace tab. A shop restocking from
    // a wholesaler is an ordinary buyer, which is the whole premise of the
    // universal marketplace.
    // Five is the most a bottom bar holds legibly, so each addition is a swap.
    // Addresses moved out: they are set during checkout, whereas messaging a
    // seller is something you do while browsing.
    HOUSEHOLD: [
      { href: '/dashboard',     label: t('Home', 'Nyumbani'),    icon: Home },
      { href: '/shop',          label: t('Shop', 'Soko'),        icon: ShoppingBag },
      { href: '/orders',        label: t('Orders', 'Oda'),       icon: Package },
      { href: '/messages',      label: t('Chat', 'Ujumbe'),      icon: MessageSquare },
      { href: '/notifications', label: t('Alerts', 'Arifa'),     icon: Bell },
    ],
    // /sell replaces the shop-setup tab: setup is a one-time task that lives in
    // the dashboard, whereas listing products is the daily work. The gas-only
    // /supplier/inventory page stays reachable, but listing any product is now
    // the primary action.
    SUPPLIER: [
      { href: '/dashboard',          label: t('Orders', 'Oda'),    icon: Store },
      { href: '/sell',               label: t('Sell', 'Uza'),      icon: PackagePlus },
      { href: '/messages',           label: t('Chat', 'Ujumbe'),   icon: MessageSquare },
      { href: '/shop',               label: t('Shop', 'Soko'),     icon: ShoppingBag },
      { href: '/notifications',      label: t('Alerts', 'Arifa'),  icon: Bell },
    ],
    RIDER: [
      { href: '/dashboard',      label: t('Jobs', 'Kazi'),        icon: Bike },
      { href: '/rider/earnings', label: t('Earnings', 'Mapato'),  icon: Wallet },
      { href: '/messages',       label: t('Chat', 'Ujumbe'),      icon: MessageSquare },
      { href: '/notifications',  label: t('Alerts', 'Arifa'),     icon: Bell },
    ],
    ADMIN: [
      { href: '/dashboard', label: t('Dashboard', 'Dashibodi'), icon: ShieldCheck },
    ],
    DISTRIBUTOR: [
      { href: '/dashboard',          label: t('Orders', 'Oda'),     icon: Truck },
      { href: '/sell',               label: t('Sell', 'Uza'),       icon: PackagePlus },
      { href: '/messages',           label: t('Chat', 'Ujumbe'),    icon: MessageSquare },
      { href: '/shop',               label: t('Shop', 'Soko'),      icon: ShoppingBag },
      { href: '/notifications',      label: t('Alerts', 'Arifa'),   icon: Bell },
    ],
    BRAND: [
      { href: '/dashboard',     label: t('Campaigns', 'Matangazo'), icon: Megaphone },
      { href: '/notifications', label: t('Alerts', 'Arifa'),        icon: Bell },
    ],
  };

  const tabs = TABS[role] ?? TABS.HOUSEHOLD;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2 py-1.5">
        {tabs.map((tab) => {
          const active = pathname === tab.href || (tab.href !== '/dashboard' && pathname.startsWith(tab.href));
          const Icon = tab.icon;
          return (
            <Link key={tab.href} href={tab.href} className={cn('flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 transition', active ? 'text-flame' : 'text-ink/45')}>
              <Icon size={21} strokeWidth={active ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
