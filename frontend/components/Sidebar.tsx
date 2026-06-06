'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useChatUnread, chatState } from '../lib/chatState';
import { auth } from '../lib/api';
import {
  Home, Send, MessageCircle, TrendingUp, Receipt,
  History, User, QrCode, Building2, LogOut, Briefcase,
  Download, ArrowDownToLine,
} from 'lucide-react';

// Routes where the sidebar must NEVER appear
const PUBLIC_PATHS = ['/', '/auth/login', '/auth/register'];
const PUBLIC_PREFIXES = ['/auth/', '/claim/', '/join/'];

function isPublicPath(path: string): boolean {
  if (PUBLIC_PATHS.includes(path)) return true;
  return PUBLIC_PREFIXES.some(p => path.startsWith(p));
}

const NAV_SECTIONS = [
  {
    title: '',
    items: [
      { href: '/dashboard', label: 'Home', icon: Home          },
      { href: '/chat',      label: 'Chat', icon: MessageCircle },
    ],
  },
  {
    title: 'Money',
    items: [
      { href: '/send',     label: 'Send',      icon: Send           },
      { href: '/deposit',  label: 'Add money', icon: Download        },
      { href: '/withdraw', label: 'Withdraw',  icon: ArrowDownToLine },
      { href: '/scan',     label: 'Scan',      icon: QrCode          },
      { href: '/bills',    label: 'Bills',     icon: Receipt         },
    ],
  },
  {
    title: 'Grow',
    items: [
      { href: '/grow', label: 'Grow', icon: TrendingUp },
    ],
  },
  {
    title: 'Business',
    items: [
      { href: '/business', label: 'Business', icon: Briefcase },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/history', label: 'History', icon: History },
      { href: '/profile', label: 'Profile', icon: User    },
    ],
  },
];

// Admin entry — only appended when the logged-in user is an admin.
const ADMIN_ITEM = { href: '/admin', label: 'Admin', icon: Building2 };

export default function Sidebar() {
  const path    = usePathname();
  const router  = useRouter();
  const unread  = useChatUnread();
  const [authed,  setAuthed]  = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Clear unread when user navigates to /chat
  useEffect(() => {
    if (path === '/chat') chatState.clear();
  }, [path]);

  useEffect(() => {
    // Check both session storage and cookie
    const hasToken  = !!(localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt'));
    const hasCookie = document.cookie.includes('olomipay_session=1');
    setAuthed(hasToken || hasCookie);
  }, [path]); // re-check on every navigation

  // Resolve admin status from the server — the Admin link only appears for admins.
  // IMPORTANT: never call auth.me() on public/unauthenticated pages. On the login
  // page (no token) a 401 makes api.ts hard-redirect to /auth/login, which would
  // remount the sidebar and call auth.me() again → infinite page-refresh loop.
  useEffect(() => {
    if (!authed || isPublicPath(path)) { setIsAdmin(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await auth.me();
        if (!cancelled) setIsAdmin(!!r?.user?.isAdmin);
      } catch { if (!cancelled) setIsAdmin(false); }
    })();
    return () => { cancelled = true; };
  }, [authed, path]);

  // Don't render on public pages or when not authenticated
  if (isPublicPath(path) || !authed) return null;

  // Build the section list, appending Admin to "Account" only for admins.
  const sections = NAV_SECTIONS.map(s =>
    s.title === 'Account' && isAdmin
      ? { ...s, items: [s.items[0], ADMIN_ITEM, ...s.items.slice(1)] }
      : s,
  );

  function handleLogout() {
    localStorage.clear();
    // Expire session cookie
    document.cookie = 'olomipay_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
    router.push('/');
  }

  return (
    <aside className="hidden md:flex flex-col w-56 lg:w-64 h-screen fixed left-0 top-0 z-50
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
              Money made simple
            </p>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="thin-scroll relative flex-1 overflow-y-auto py-3 px-3 space-y-1">
        {sections.map((section, si) => (
          <div key={si} className={si > 0 ? 'pt-3' : ''}>
            {section.title && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {section.title}
              </p>
            )}
            {section.items.map(({ href, label, icon: Icon }) => {
              const active    = path === href || path.startsWith(href + '/');
              const showBadge = href === '/chat' && unread > 0 && !active;
              return (
                <Link key={href} href={href}
                  className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                    active
                      ? 'text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}>
                  {active && (
                    <span className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-blue-500 to-emerald-500 shadow-lg shadow-blue-500/25" />
                  )}
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
          </div>
        ))}
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
