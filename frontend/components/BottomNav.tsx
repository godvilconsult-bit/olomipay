'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  Home, Send, MessageCircle, PiggyBank, MoreHorizontal,
  Receipt, ArrowUpDown, HandCoins, CreditCard, TrendingUp,
  Star, Shield, History, User, Bell, Calendar, X,
  QrCode, Landmark, Building2, Users, TrendingDown,
} from 'lucide-react';
import { useSocket } from '../lib/useSocket';

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
  { href: '/rewards',       label: 'Rewards',    icon: Star       },
  { href: '/credit',        label: 'Credit',     icon: Shield     },
  { href: '/history',       label: 'History',    icon: History    },
  { href: '/notifications', label: 'Alerts',     icon: Bell       },
  { href: '/schedule',      label: 'Scheduled',  icon: Calendar   },
  { href: '/protect',       label: 'Protection', icon: TrendingDown },
  { href: '/admin',         label: 'Admin',      icon: Building2  },
  { href: '/profile',       label: 'Profile',    icon: User       },
];

export default function BottomNav() {
  const path    = usePathname();
  const router  = useRouter();
  const [sheet, setSheet] = useState(false);
  const [unread, setUnread] = useState(0);

  const token = typeof window !== 'undefined' ? sessionStorage.getItem('olomipay_rt') : null;
  const { on } = useSocket(token);

  // Fetch unread count + listen for new messages
  useEffect(() => {
    if (!token) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chat/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(r => {
        if (r.success) {
          const total = r.data.conversations.reduce((sum: number, c: any) => sum + (c.unreadCount ?? 0), 0);
          setUnread(total);
        }
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    const unsub = on('new_message', () => {
      if (!path.startsWith('/chat')) setUnread(u => u + 1);
    });
    return unsub;
  }, [on, path]);

  // Clear unread when entering /chat
  useEffect(() => {
    if (path.startsWith('/chat')) setUnread(0);
  }, [path]);

  return (
    <>
      {sheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSheet(false)} />
          <div className="relative bg-white dark:bg-slate-900 rounded-t-3xl p-5 pb-10 shadow-2xl max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">More</h3>
              <button onClick={() => setSheet(false)} className="p-2"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {MORE_ITEMS.map(({ href, label, icon: Icon }) => (
                <button key={href} onClick={() => { setSheet(false); router.push(href); }}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Icon size={20} className="text-slate-600 dark:text-slate-400" />
                  </div>
                  <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400 text-center leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 lg:hidden">
        <div className="flex justify-around items-center h-16 max-w-md mx-auto px-2">
          {MAIN_NAV.map(({ href, label, icon: Icon, hasBadge }) => {
            const active = path.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`relative flex flex-col items-center justify-center flex-1 min-h-[48px] gap-0.5 rounded-xl transition-colors ${
                  active ? 'text-primary' : 'text-slate-400 dark:text-slate-500'
                }`}>
                <div className="relative">
                  <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                  {hasBadge && unread > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-danger text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium leading-none">{label}</span>
              </Link>
            );
          })}
          <button onClick={() => setSheet(true)}
            className={`flex flex-col items-center justify-center flex-1 min-h-[48px] gap-0.5 rounded-xl ${sheet ? 'text-primary' : 'text-slate-400'}`}>
            <MoreHorizontal size={22} strokeWidth={1.8} />
            <span className="text-[10px] font-medium leading-none">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
