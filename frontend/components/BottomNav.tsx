'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  Home, Send, MessageCircle, PiggyBank, MoreHorizontal,
  Receipt, ArrowUpDown, HandCoins, CreditCard, TrendingUp,
  Star, Shield, History, User, Bell, Calendar, X,
  QrCode, Landmark, Building2, Users, TrendingDown, Briefcase,
} from 'lucide-react';
import { useChatUnread, chatState } from '../lib/chatState';

const MAIN_NAV = [
  { href: '/dashboard', label: 'Home',    icon: Home          },
  { href: '/chat',      label: 'Chat',    icon: MessageCircle, hasBadge: true },
  { href: '/send',      label: 'Send',    icon: Send          },
  { href: '/savings',   label: 'Savings', icon: PiggyBank     },
];

const MORE_ITEMS = [
  { href: '/stake',         label: 'Earn',       icon: TrendingUp },
  { href: '/chama',         label: 'Chama',      icon: Users      },
  { href: '/bills',         label: 'Bills',      icon: Receipt    },
  { href: '/swap',          label: 'Swap',       icon: ArrowUpDown},
  { href: '/lending',       label: 'Lending',    icon: HandCoins  },
  { href: '/card',          label: 'Card',       icon: CreditCard },
  { href: '/invest',        label: 'Bonds',      icon: Landmark   },
  { href: '/merchant',      label: 'Merchant',   icon: QrCode     },
  { href: '/payroll',       label: 'Payroll',    icon: Briefcase  },
  { href: '/rewards',       label: 'Rewards',    icon: Star       },
  { href: '/credit',        label: 'Credit',     icon: Shield     },
  { href: '/history',       label: 'History',    icon: History    },
  { href: '/notifications', label: 'Alerts',     icon: Bell       },
  { href: '/schedule',      label: 'Scheduled',  icon: Calendar   },
  { href: '/protect',       label: 'Protection', icon: TrendingDown },
  { href: '/admin',         label: 'Admin',      icon: Building2  },
  { href: '/profile',       label: 'Profile',    icon: User       },
];

const HIDE_ON_PATHS    = ['/', '/auth/login', '/auth/register'];
const HIDE_ON_PREFIXES = ['/auth/', '/claim/', '/join/'];

export default function BottomNav() {
  const path    = usePathname();
  const router  = useRouter();
  const [sheet, setSheet] = useState(false);
  // Read unread count from global shared state (updated by ChatNotifier)
  const unread = useChatUnread();

  // Don't render on public/auth pages
  if (HIDE_ON_PATHS.includes(path) || HIDE_ON_PREFIXES.some(p => path.startsWith(p))) return null;

  // Clear unread count when user opens chat list
  useEffect(() => {
    if (path === '/chat') chatState.clear();
  }, [path]);

  return (
    <>
      {sheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSheet(false)} />
          <div className="relative rounded-t-[2rem] border-t border-white/10 bg-[#0a1120]/95 p-5 pb-10 shadow-2xl backdrop-blur-xl max-h-[72vh] overflow-y-auto">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-white">All features</h3>
              <button onClick={() => setSheet(false)} className="rounded-full bg-white/10 p-2 text-slate-300"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {MORE_ITEMS.map(({ href, label, icon: Icon }) => (
                <button key={href} onClick={() => { setSheet(false); router.push(href); }}
                  className="flex flex-col items-center gap-2 rounded-2xl p-2 active:scale-95">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] transition-colors hover:border-blue-400/40 hover:bg-white/10">
                    <Icon size={20} className="text-blue-300" />
                  </div>
                  <span className="text-[10px] font-medium text-slate-400 text-center leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-1">
        <div className="mx-auto flex max-w-md items-center justify-around rounded-[1.75rem] border border-white/10
                        bg-[#0a1120]/90 px-2 py-1.5 shadow-2xl backdrop-blur-xl">
          {MAIN_NAV.map(({ href, label, icon: Icon, hasBadge }) => {
            const active = path.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`relative flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-2 transition-all ${
                  active ? 'text-white' : 'text-slate-500'
                }`}>
                {active && (
                  <span className="absolute inset-x-2 inset-y-0.5 -z-10 rounded-2xl bg-gradient-to-br from-blue-500 to-emerald-500 shadow-lg shadow-blue-500/30" />
                )}
                <div className="relative">
                  <Icon size={21} strokeWidth={active ? 2.4 : 1.8} />
                  {hasBadge && unread > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 border border-[#0a1120]">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium leading-none">{label}</span>
              </Link>
            );
          })}
          <button onClick={() => setSheet(true)}
            className={`relative flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-2 transition-all ${sheet ? 'text-white' : 'text-slate-500'}`}>
            {sheet && <span className="absolute inset-x-2 inset-y-0.5 -z-10 rounded-2xl bg-gradient-to-br from-blue-500 to-emerald-500" />}
            <MoreHorizontal size={21} strokeWidth={1.8} />
            <span className="text-[10px] font-medium leading-none">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
