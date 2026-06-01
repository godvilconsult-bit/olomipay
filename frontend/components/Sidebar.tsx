'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home, Send, MessageCircle, PiggyBank, TrendingUp,
  Users, Receipt, ArrowUpDown, HandCoins, CreditCard,
  Star, Shield, History, User, Bell, Calendar,
  QrCode, Landmark, Building2, TrendingDown, LogOut,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard',     label: 'Home',       icon: Home         },
  { href: '/chat',          label: 'Chat',        icon: MessageCircle },
  { href: '/send',          label: 'Send',        icon: Send         },
  { href: '/savings',       label: 'Savings',     icon: PiggyBank    },
  { href: '/stake',         label: 'Earn',        icon: TrendingUp   },
  { href: '/chama',         label: 'Chama',       icon: Users        },
  { href: '/bills',         label: 'Bills',       icon: Receipt      },
  { href: '/swap',          label: 'Swap',        icon: ArrowUpDown  },
  { href: '/lending',       label: 'Lending',     icon: HandCoins    },
  { href: '/card',          label: 'Card',        icon: CreditCard   },
  { href: '/invest',        label: 'Bonds',       icon: Landmark     },
  { href: '/merchant',      label: 'Merchant',    icon: QrCode       },
  { href: '/rewards',       label: 'Rewards',     icon: Star         },
  { href: '/credit',        label: 'Credit',      icon: Shield       },
  { href: '/history',       label: 'History',     icon: History      },
  { href: '/notifications', label: 'Alerts',      icon: Bell         },
  { href: '/schedule',      label: 'Scheduled',   icon: Calendar     },
  { href: '/protect',       label: 'Protection',  icon: TrendingDown },
  { href: '/admin',         label: 'Admin',       icon: Building2    },
  { href: '/profile',       label: 'Profile',     icon: User         },
];

export default function Sidebar() {
  const path   = usePathname();
  const router = useRouter();

  function handleLogout() {
    sessionStorage.clear();
    router.push('/');
  }

  return (
    <aside className="hidden lg:flex flex-col w-64 min-h-screen bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 fixed left-0 top-0 z-50">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-2xl flex items-center justify-center text-white font-bold text-lg">T</div>
          <div>
            <p className="font-bold text-slate-800 dark:text-slate-200">Tuma</p>
            <p className="text-xs text-slate-400">Digital Wallet</p>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + '/');
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                active
                  ? 'bg-primary text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
              }`}>
              <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-sm">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-slate-100 dark:border-slate-800">
        <button onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl w-full text-left text-slate-500 hover:bg-red-50 hover:text-danger transition-colors">
          <LogOut size={18} />
          <span className="text-sm">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
