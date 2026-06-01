'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useChatUnread, chatState } from '../lib/chatState';
import {
  Home, Send, MessageCircle, PiggyBank, TrendingUp,
  Users, Receipt, ArrowUpDown, HandCoins, CreditCard,
  Star, Shield, History, User, Bell, Calendar,
  QrCode, Landmark, Building2, TrendingDown, LogOut,
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
    <aside className="hidden md:flex flex-col w-56 lg:w-64 min-h-screen bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 fixed left-0 top-0 z-50">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="OlomiPay" className="w-9 h-9 flex-shrink-0" />
          <div>
            <p className="font-bold text-slate-800 dark:text-slate-200 text-sm leading-tight">OlomiPay</p>
            <p className="text-[9px] text-primary leading-tight">Building Trust Through Blockchain</p>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active   = path === href || path.startsWith(href + '/');
          const showBadge = href === '/chat' && unread > 0 && !active;
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                active
                  ? 'bg-primary text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
              }`}>
              <div className="relative flex-shrink-0">
                <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </div>
              <span className="text-sm flex-1">{label}</span>
              {showBadge && (
                <span className="bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[18px] h-4.5 flex items-center justify-center px-1 ml-auto">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
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
