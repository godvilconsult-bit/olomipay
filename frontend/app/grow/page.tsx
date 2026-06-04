'use client';

/* Grow hub — one nav entry that tabs across Savings · Earn · Chama.
   Each tab shows the value prop + opens the full feature. */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PiggyBank, TrendingUp, Users, ArrowRight } from 'lucide-react';
import BottomNav from '../../components/BottomNav';

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
  const p = PANELS[tab];
  const Icon = p.icon;

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 px-5 pt-safe-top pt-5 pb-3 max-w-md mx-auto">
        <p className="ds-eyebrow text-slate-400">Grow your money</p>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Grow</h1>
      </div>

      <div className="px-5 max-w-md mx-auto space-y-5">
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
