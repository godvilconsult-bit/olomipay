'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  Home, Send, MessageCircle, TrendingUp, User, Plus, X,
  Receipt, ArrowUpDown, QrCode, Download, ArrowDownToLine,
} from 'lucide-react';
import { useChatUnread, chatState } from '../lib/chatState';

// 4 primary tabs (Pay FAB sits in the center, between Chat and Grow)
const LEFT_NAV = [
  { href: '/dashboard', label: 'Home', icon: Home          },
  { href: '/chat',      label: 'Chat', icon: MessageCircle, hasBadge: true },
];
const RIGHT_NAV = [
  { href: '/grow',    label: 'Grow',    icon: TrendingUp },
  { href: '/profile', label: 'Profile', icon: User       },
];

// Pay quick-sheet actions
const PAY_ACTIONS = [
  { href: '/send',     label: 'Send',       icon: Send,           grad: 'from-blue-500 to-cyan-500'    },
  { href: '/deposit',  label: 'Add money',  icon: Download,       grad: 'from-emerald-500 to-teal-500' },
  { href: '/withdraw', label: 'Withdraw',   icon: ArrowDownToLine,grad: 'from-amber-500 to-orange-500' },
  { href: '/scan',     label: 'Scan',       icon: QrCode,         grad: 'from-violet-500 to-purple-500'},
  { href: '/swap',     label: 'Swap',       icon: ArrowUpDown,    grad: 'from-fuchsia-500 to-pink-500' },
  { href: '/bills',    label: 'Bills',      icon: Receipt,        grad: 'from-slate-500 to-slate-600'  },
];

const HIDE_ON_PATHS    = ['/', '/auth/login', '/auth/register'];
const HIDE_ON_PREFIXES = ['/auth/', '/claim/', '/join/'];

export default function BottomNav() {
  const path   = usePathname();
  const router = useRouter();
  const [sheet, setSheet] = useState(false);
  const unread = useChatUnread();

  // Clear unread when viewing chat list (hook must run before any early return)
  useEffect(() => {
    if (path === '/chat') chatState.clear();
  }, [path]);

  if (HIDE_ON_PATHS.includes(path) || HIDE_ON_PREFIXES.some(p => path.startsWith(p))) return null;

  const tab = (href: string, label: string, Icon: any, hasBadge?: boolean) => {
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
  };

  return (
    <>
      {/* Pay quick sheet */}
      {sheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSheet(false)} />
          <div className="relative rounded-t-[2rem] border-t border-white/10 bg-[#0a1120]/95 p-5 pb-10 shadow-2xl backdrop-blur-xl">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-white">Pay & transfer</h3>
              <button onClick={() => setSheet(false)} className="rounded-full bg-white/10 p-2 text-slate-300"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {PAY_ACTIONS.map(({ href, label, icon: Icon, grad }) => (
                <button key={href} onClick={() => { setSheet(false); router.push(href); }}
                  className="flex flex-col items-center gap-2 rounded-2xl p-2 active:scale-95">
                  <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${grad} text-white shadow-lg`}>
                    <Icon size={22} />
                  </div>
                  <span className="text-[11px] font-medium text-slate-300 text-center leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-1 pointer-events-none">
        <div className="pointer-events-auto mx-auto flex max-w-md items-center justify-around rounded-[1.9rem]
                        border border-black/5 dark:border-white/10
                        bg-white/65 dark:bg-[#0a1120]/65 px-2 py-1.5
                        shadow-[0_8px_30px_-8px_rgba(0,0,0,0.25)] backdrop-blur-2xl backdrop-saturate-150">
          {LEFT_NAV.map(n => tab(n.href, n.label, n.icon, n.hasBadge))}

          {/* Center Pay FAB */}
          <div className="flex flex-1 justify-center">
            <button onClick={() => setSheet(true)} aria-label="Pay"
              className="-mt-7 flex h-16 w-16 flex-col items-center justify-center rounded-full
                         bg-gradient-to-br from-blue-500 to-emerald-500 text-white
                         shadow-[0_8px_24px_-4px_rgba(37,99,235,0.6)] ring-4 ring-white/70 dark:ring-[#0a1120]
                         active:scale-95 transition-transform">
              <Plus size={26} strokeWidth={2.6} />
              <span className="text-[9px] font-semibold leading-none mt-0.5">Pay</span>
            </button>
          </div>

          {RIGHT_NAV.map(n => tab(n.href, n.label, n.icon))}
        </div>
      </nav>
    </>
  );
}
