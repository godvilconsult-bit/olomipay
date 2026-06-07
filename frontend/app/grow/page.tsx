'use client';

/* Grow hub — one nav entry that tabs across Savings · Earn · Chama.
   Each tab shows the value prop + opens the full feature. */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PiggyBank, TrendingUp, Users, ArrowRight, Sparkles } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import { formatUsdc } from '../../lib/utils';

const API = process.env.NEXT_PUBLIC_API_URL;
const tok = () => (typeof window !== 'undefined' ? (localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt')) : '') || '';

type Tab = 'savings' | 'earn' | 'chama';

const TABS: { id: Tab; label: string }[] = [
  { id: 'savings', label: 'Savings' },
  { id: 'earn',    label: 'Earn'    },
  { id: 'chama',   label: 'Chama'   },
];

const PANELS: Record<Tab, {
  icon: any; title: string; blurb: string; points: string[]; href: string; cta: string; grad: string;
}> = {
  savings: {
    icon: PiggyBank, title: 'Savings', grad: 'from-emerald-500 to-teal-500',
    blurb: 'Set money aside and watch it grow — withdraw anytime.',
    points: ['Earn interest that accrues every second', 'No lock-in — withdraw whenever you want', 'Your funds, always protected'],
    href: '/savings', cta: 'Open Savings',
  },
  earn: {
    icon: TrendingUp, title: 'Earn', grad: 'from-blue-500 to-cyan-500',
    blurb: 'Lock funds for a fixed term and earn a higher rate.',
    points: ['Higher returns for longer terms', 'Clear, upfront rates', 'Auto-credited at maturity'],
    href: '/stake', cta: 'Start Earning',
  },
  chama: {
    icon: Users, title: 'Chama', grad: 'from-violet-500 to-blue-500',
    blurb: 'Save together in a rotating group and take turns receiving the pot.',
    points: ['Invite friends & family', 'Automatic rotation each round', 'Everyone’s contributions protected'],
    href: '/chama', cta: 'Open Chama',
  },
};

export default function GrowPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('savings');
  const [pos, setPos] = useState<{ principal: number; yieldEarned: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const p = PANELS[tab];
  const Icon = p.icon;

  // Live savings position — makes the hub feel alive (not just marketing).
  useEffect(() => {
    fetch(`${API}/api/savings/balance`, { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.json())
      .then(r => { if (r.success) setPos({ principal: r.data.principal ?? 0, yieldEarned: r.data.yieldEarned ?? 0 }); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const growing = (pos?.principal ?? 0) + (pos?.yieldEarned ?? 0);

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 px-5 pt-safe-top pt-5 pb-3 max-w-md mx-auto">
        <p className="ds-eyebrow text-slate-400">Grow your money</p>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Grow</h1>
      </div>

      <div className="px-5 max-w-md mx-auto space-y-5">
        {/* Live "you're growing" summary */}
        {!loaded ? (
          <div className="skeleton h-24 w-full rounded-[1.5rem]" />
        ) : growing > 0 ? (
          <div className="relative overflow-hidden rounded-[1.5rem] p-5 text-white
                          bg-[linear-gradient(135deg,#065f46_0%,#0d9488_55%,#10b981_100%)]
                          shadow-[0_20px_50px_-20px_rgba(16,185,129,0.55)]">
            <div className="pointer-events-none absolute -top-12 -right-8 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
            <p className="relative z-10 text-xs font-medium uppercase tracking-[0.14em] text-white/70">You're growing</p>
            <p className="relative z-10 mt-1 text-3xl font-bold tracking-tight tabular-nums">{formatUsdc(growing)}</p>
            <p className="relative z-10 mt-1 flex items-center gap-1 text-sm text-white/85">
              <Sparkles size={13} /> +{formatUsdc(pos!.yieldEarned)} earned so far 🌱
            </p>
          </div>
        ) : (
          <div className="card flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500"><TrendingUp size={20} /></span>
            <div className="flex-1">
              <p className="font-semibold text-sm">Put your money to work</p>
              <p className="text-xs text-slate-500">Start with any amount — it earns from day one.</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 dark:bg-white/5 rounded-full p-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all ${
                tab === t.id ? 'bg-grad-brand text-white shadow-ds-btn' : 'text-slate-500 dark:text-slate-400'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Panel */}
        <div className="card overflow-hidden">
          <div className={`-m-5 mb-4 p-6 bg-gradient-to-br ${p.grad} text-white`}>
            <Icon size={30} />
            <h2 className="text-xl font-bold mt-3">{p.title}</h2>
            <p className="text-sm text-white/85 mt-1">{p.blurb}</p>
          </div>
          <ul className="space-y-2.5">
            {p.points.map(pt => (
              <li key={pt} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                <span className="mt-0.5 text-emerald-500">✓</span>{pt}
              </li>
            ))}
          </ul>
          <button onClick={() => router.push(p.href)}
            className="mt-5 w-full bg-grad-brand text-white font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-ds-btn active:scale-[0.98] transition-transform">
            {p.cta} <ArrowRight size={18} />
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
