'use client';

import Link from 'next/link';
import { Send, ArrowDownCircle, ArrowUpCircle, QrCode, Repeat } from 'lucide-react';

// Secondary actions (the hero "Send" is rendered separately as a gradient CTA)
const ACTIONS = [
  { href: '/deposit',  label: 'Deposit',  icon: ArrowDownCircle, tint: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-500/20' },
  { href: '/withdraw', label: 'Withdraw', icon: ArrowUpCircle,   tint: 'text-amber-600 dark:text-amber-400',     ring: 'ring-amber-500/20' },
  { href: '/swap',     label: 'Swap',     icon: Repeat,          tint: 'text-cyan-600 dark:text-cyan-400',       ring: 'ring-cyan-500/20' },
  { href: '/scan',     label: 'Scan',     icon: QrCode,          tint: 'text-primary dark:text-blue-400',        ring: 'ring-blue-500/20' },
];

export default function QuickActions() {
  return (
    <div className="space-y-3">
      {/* Hero CTA — the signature blue→emerald "money" gradient */}
      <Link
        href="/send"
        className="group flex items-center gap-4 w-full rounded-ds-xl bg-grad-brand text-white
                   px-5 py-4 shadow-ds-btn active:scale-[0.98] transition-transform ease-ds-out duration-150"
      >
        <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
          <Send size={20} strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[15px] leading-tight">Send money</p>
          <p className="text-xs text-white/80 leading-tight mt-0.5">Instant · by phone, address or QR</p>
        </div>
        <span className="text-white/70 text-xl group-active:translate-x-0.5 transition-transform">→</span>
      </Link>

      {/* Secondary actions — glass tiles */}
      <div className="grid grid-cols-4 gap-2.5">
        {ACTIONS.map(({ href, label, icon: Icon, tint, ring }) => (
          <Link key={href} href={href} className="group flex flex-col items-center gap-2">
            <div className={`w-full aspect-square max-w-[68px] min-h-[48px] rounded-2xl
                            bg-white/70 dark:bg-white/5 backdrop-blur
                            ring-1 ${ring} border border-white/60 dark:border-white/10
                            flex items-center justify-center ${tint}
                            shadow-sm group-active:scale-95 transition-transform ease-ds-out duration-100`}>
              <Icon size={22} strokeWidth={1.9} />
            </div>
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
