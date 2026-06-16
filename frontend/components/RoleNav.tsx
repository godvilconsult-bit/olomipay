'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Package, MapPin, Bell, Store, Boxes, Bike, Wallet, ShieldCheck, Truck } from 'lucide-react';
import { Role } from '../lib/api';
import { useT } from '../lib/i18n';
import { cn } from './ui';

export function RoleNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const { t } = useT();

  const TABS: Record<Role, { href: string; label: string; icon: any }[]> = {
    HOUSEHOLD: [
      { href: '/dashboard',     label: t('Home', 'Nyumbani'),    icon: Home },
      { href: '/orders',        label: t('Orders', 'Oda'),       icon: Package },
      { href: '/addresses',     label: t('Addresses', 'Anwani'), icon: MapPin },
      { href: '/notifications', label: t('Alerts', 'Arifa'),     icon: Bell },
    ],
    SUPPLIER: [
      { href: '/dashboard',          label: t('Orders', 'Oda'),    icon: Store },
      { href: '/supplier/inventory', label: t('Stock', 'Bidhaa'),  icon: Boxes },
      { href: '/supplier/setup',     label: t('Shop', 'Duka'),     icon: MapPin },
      { href: '/notifications',      label: t('Alerts', 'Arifa'),  icon: Bell },
    ],
    RIDER: [
      { href: '/dashboard',      label: t('Jobs', 'Kazi'),        icon: Bike },
      { href: '/rider/earnings', label: t('Earnings', 'Mapato'),  icon: Wallet },
      { href: '/notifications',  label: t('Alerts', 'Arifa'),     icon: Bell },
    ],
    ADMIN: [
      { href: '/dashboard', label: t('Dashboard', 'Dashibodi'), icon: ShieldCheck },
    ],
    DISTRIBUTOR: [
      { href: '/dashboard',          label: t('Orders', 'Oda'),     icon: Truck },
      { href: '/distributor/stock',  label: t('Stock', 'Bidhaa'),   icon: Boxes },
      { href: '/notifications',      label: t('Alerts', 'Arifa'),   icon: Bell },
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
