'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Package, MapPin, Bell, Store, Boxes, Bike, Wallet, ShieldCheck } from 'lucide-react';
import { Role } from '../lib/api';
import { cn } from './ui';

type Tab = { href: string; label: string; icon: any };

const TABS: Record<Role, Tab[]> = {
  HOUSEHOLD: [
    { href: '/dashboard',     label: 'Nyumbani', icon: Home },
    { href: '/orders',        label: 'Oda',      icon: Package },
    { href: '/addresses',     label: 'Anwani',   icon: MapPin },
    { href: '/notifications', label: 'Arifa',    icon: Bell },
  ],
  SUPPLIER: [
    { href: '/dashboard',         label: 'Oda',     icon: Store },
    { href: '/supplier/inventory',label: 'Bidhaa',  icon: Boxes },
    { href: '/supplier/setup',    label: 'Duka',    icon: MapPin },
    { href: '/notifications',     label: 'Arifa',   icon: Bell },
  ],
  RIDER: [
    { href: '/dashboard',     label: 'Kazi',   icon: Bike },
    { href: '/rider/earnings',label: 'Mapato', icon: Wallet },
    { href: '/notifications', label: 'Arifa',  icon: Bell },
  ],
  ADMIN: [
    { href: '/dashboard', label: 'Dashibodi', icon: ShieldCheck },
  ],
};

export function RoleNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const tabs = TABS[role] ?? TABS.HOUSEHOLD;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/95 backdrop-blur dark:border-white/5 dark:bg-ink-2/95" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2 py-1.5">
        {tabs.map((t) => {
          const active = pathname === t.href || (t.href !== '/dashboard' && pathname.startsWith(t.href));
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} className={cn('flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 transition', active ? 'text-flame' : 'text-ink/45 dark:text-sand/45')}>
              <Icon size={21} strokeWidth={active ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
