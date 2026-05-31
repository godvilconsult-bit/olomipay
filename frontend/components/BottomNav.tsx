'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Home, Send, Receipt, PiggyBank, MoreHorizontal, History, User, Bell, Calendar, X } from 'lucide-react';

const MAIN_NAV = [
  { href: '/dashboard', label: 'Home',    icon: Home      },
  { href: '/send',      label: 'Send',    icon: Send      },
  { href: '/bills',     label: 'Bills',   icon: Receipt   },
  { href: '/savings',   label: 'Savings', icon: PiggyBank },
];

const MORE_ITEMS = [
  { href: '/schedule',      label: 'Scheduled',     icon: Calendar },
  { href: '/history',       label: 'History',       icon: History  },
  { href: '/notifications', label: 'Notifications', icon: Bell     },
  { href: '/profile',       label: 'Profile',       icon: User     },
];

export default function BottomNav() {
  const path    = usePathname();
  const router  = useRouter();
  const [sheet, setSheet] = useState(false);

  return (
    <>
      {/* More sheet overlay */}
      {sheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSheet(false)} />
          <div className="relative bg-white dark:bg-slate-900 rounded-t-3xl p-5 pb-10 shadow-2xl">
            <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-5" />
            <div className="grid grid-cols-4 gap-3">
              {MORE_ITEMS.map(({ href, label, icon: Icon }) => (
                <button
                  key={href}
                  onClick={() => { setSheet(false); router.push(href); }}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Icon size={22} className="text-slate-600 dark:text-slate-400" />
                  </div>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 lg:hidden">
        <div className="flex justify-around items-center h-16 max-w-md mx-auto px-2">
          {MAIN_NAV.map(({ href, label, icon: Icon }) => {
            const active = path.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`flex flex-col items-center justify-center flex-1 min-h-[48px] gap-0.5 rounded-xl transition-colors
                  ${active ? 'text-primary' : 'text-slate-400 dark:text-slate-500'}`}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                <span className="text-[10px] font-medium leading-none">{label}</span>
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setSheet(true)}
            className={`flex flex-col items-center justify-center flex-1 min-h-[48px] gap-0.5 rounded-xl transition-colors
              ${sheet ? 'text-primary' : 'text-slate-400 dark:text-slate-500'}`}
          >
            <MoreHorizontal size={22} strokeWidth={1.8} />
            <span className="text-[10px] font-medium leading-none">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
