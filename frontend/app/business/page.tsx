'use client';

/* Business hub — separate area grouping merchant + payroll tools. */

import { useRouter } from 'next/navigation';
import { Store, Users2, ArrowRight, Briefcase } from 'lucide-react';
import BottomNav from '../../components/BottomNav';

const TOOLS = [
  {
    icon: Store, title: 'Merchant', grad: 'from-blue-500 to-cyan-500',
    blurb: 'Accept payments, generate pay-codes and track your sales.',
    href: '/merchant',
  },
  {
    icon: Users2, title: 'Payroll', grad: 'from-violet-500 to-blue-500',
    blurb: 'Pay your team in bulk — salaries and wages in one run.',
    href: '/payroll',
  },
];

export default function BusinessPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen pb-24">
      <div className="px-5 pt-safe-top pt-5 pb-3 max-w-md mx-auto">
        <p className="ds-eyebrow text-slate-400">For your business</p>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Briefcase size={22} /> Business
        </h1>
      </div>

      <div className="px-5 max-w-md mx-auto space-y-4">
        {TOOLS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.href} onClick={() => router.push(t.href)}
              className="card w-full text-left active:scale-[0.99] transition-transform">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${t.grad} flex items-center justify-center text-white shrink-0`}>
                  <Icon size={22} />
                </div>
                <div className="flex-1">
                  <h2 className="font-bold text-slate-900 dark:text-white">{t.title}</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{t.blurb}</p>
                </div>
                <ArrowRight size={18} className="text-slate-400 shrink-0" />
              </div>
            </button>
          );
        })}
      </div>

      <BottomNav />
    </div>
  );
}
