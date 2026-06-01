'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useChatUnread, chatState } from '../lib/chatState';
import {
  Home, Send, MessageCircle, PiggyBank, TrendingUp,
  Users, Receipt, ArrowUpDown, HandCoins, CreditCard,
  Star, Shield, History, User, Bell, Calendar,
  QrCode, Landmark, Building2, TrendingDown, LogOut, Briefcase,
} from 'lucide-react';

// Routes where the sidebar must NEVER appear
const PUBLIC_PATHS = ['/', '/auth/login', '/auth/register'];
const PUBLIC_PREFIXES = ['/auth/', '/claim/', '/join/'];

function isPublicPath(path: string): boolean {
  if (PUBLIC_PATHS.includes(path)) return true;
  return PUBLIC_PREFIXES.some(p => path.startsWith(p));
}

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
  { href: '/payroll',       label: 'Payroll',     icon: Briefcase    },
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
  const path    = usePathname();
  const router  = useRouter();
  const unread  = useChatUnread();
  const [authed, setAuthed] = useState(false);

  // Clear unread when user navigates to /chat
  useEffect(() => {
    if (path === '/chat') chatState.clear();
  }, [path]);

  useEffect(() => {
    // Check both session storage and cookie
    const hasToken  = !!(sessionStorage.getItem('olomipay_at') || sessionStorage.getItem('olomipay_rt'));
    const hasCookie = document.cookie.includes('olomipay_session=1');
    setAuthed(hasToken || hasCookie);
  }, [path]); // re-check on every navigation

  // Don't render on public pages or when not authenticated
  if (isPublicPath(path) || !authed) return null;

  function handleLogout() {
    sessionStorage.clear();
    // Expire session cookie
    document.cookie = 'olomipay_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
    router.push('/');
  }

  return (
    <aside className="hidden md:flex flex-col w-56 lg:w-64 min-h-screen fixed left-0 top-0 z-50
                      bg-[#0a1120]/95 backdrop-blur-xl border-r border-white/10 text-slate-300
                      overflow-hidden">
      {/* ambient glow */}
      <div className="anim-glow pointer-events-none absolute -top-20 -left-10 h-48 w-48 rounded-full bg-blue-600/20 blur-3xl" />
      <div className="anim-glow pointer-events-none absolute bottom-20 -right-10 h-48 w-48 rounded-full bg-emerald-500/15 blur-3xl" style={{ animationDelay: '-3s' }} />

      {/* Logo */}
      <div className="relative px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="anim-glow absolute -inset-1.5 rounded-xl bg-gradient-to-tr from-blue-500/50 to-emerald-500/50 blur-md" />
            <img src="/logo.svg" alt="OlomiPay" className="relative w-9 h-9 flex-shrink-0" />
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-tight">OlomiPay</p>
            <p className="text-[9px] leading-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
              Building Trust Through Blockchain
            </p>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="relative flex-1 overflow-y-auto py-3 px-3 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active    = path === href || path.startsWith(href + '/');
          const showBadge = href === '/chat' && unread > 0 && !active;
          return (
            <Link key={href} href={href}
              className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                active
                  ? 'text-white font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}>
              {/* active gradient pill */}
              {active && (
                <span className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-blue-500 to-emerald-500 shadow-lg shadow-blue-500/25" />
              )}
              {/* active left accent */}
              {active && <span className="absolute -left-3 top-1/2 h-6 -translate-y-1/2 w-1 rounded-full bg-gradient-to-b from-blue-400 to-emerald-400" />}
              <div className="relative flex-shrink-0">
                <Icon size={18} strokeWidth={active ? 2.4 : 1.8} />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </div>
              <span className="text-sm flex-1">{label}</span>
              {showBadge && (
                <span className="bg-gradient-to-r from-blue-500 to-emerald-500 text-white text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 ml-auto">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="relative px-3 py-4 border-t border-white/10">
        <button onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl w-full text-left text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors">
          <LogOut size={18} />
          <span className="text-sm">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
