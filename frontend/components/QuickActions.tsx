'use client';

import Link from 'next/link';
import { Send, ArrowDownCircle, ArrowUpCircle, Clock } from 'lucide-react';

const ACTIONS = [
  { href: '/send',     label: 'Send',     icon: Send,            color: 'bg-blue-100  dark:bg-blue-900/30  text-blue-600  dark:text-blue-400'  },
  { href: '/deposit',  label: 'Deposit',  icon: ArrowDownCircle, color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' },
  { href: '/withdraw', label: 'Withdraw', icon: ArrowUpCircle,   color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
  { href: '/history',  label: 'History',  icon: Clock,           color: 'bg-slate-100 dark:bg-slate-800   text-slate-600 dark:text-slate-400'  },
];

export default function QuickActions() {
  return (
    <div className="grid grid-cols-4 gap-3">
      {ACTIONS.map(({ href, label, icon: Icon, color }) => (
        <Link
          key={href}
          href={href}
          className="flex flex-col items-center gap-2 group"
        >
          <div className={`
            w-full aspect-square max-w-[72px] min-h-[48px] rounded-2xl
            flex items-center justify-center
            ${color}
            group-active:scale-95 transition-transform duration-100
          `}>
            <Icon size={24} strokeWidth={1.8} />
          </div>
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400 text-center">
            {label}
          </span>
        </Link>
      ))}
    </div>
  );
}
