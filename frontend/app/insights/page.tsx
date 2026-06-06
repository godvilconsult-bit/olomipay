'use client';

/* Smart Money Insights — plain-language understanding of your money + tips.
   Read-only; no crypto wording. The "advanced tools made simple" screen. */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp, TrendingDown, ArrowRight, Sparkles } from 'lucide-react';
import BottomNav from '../../components/BottomNav';

const API = process.env.NEXT_PUBLIC_API_URL;
const getToken = () => localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt') || '';
const $ = (n: number) => `$${Number(n ?? 0).toFixed(2)}`;

export default function InsightsPage() {
  const router = useRouter();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/insights`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(r => { if (r.success) setD(r.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const breakdownMax = Math.max(1, ...(d?.breakdown ?? []).map((b: any) => b.amount));

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 px-4 pt-safe-top pt-4 pb-3 flex items-center gap-3 max-w-md mx-auto">
        <button onClick={() => router.back()} className="p-1.5 -ml-1 rounded-full hover:bg-slate-100 dark:hover:bg-white/5">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="ds-eyebrow !text-[10px] text-slate-400 flex items-center gap-1"><Sparkles size={11} /> Smart insights</p>
          <h1 className="text-lg font-bold leading-tight">Your money{d?.month ? ` · ${d.month}` : ''}</h1>
        </div>
      </div>

      <div className="px-4 max-w-md mx-auto space-y-4 mt-1">
        {loading ? (
          <div className="card"><div className="skeleton h-5 w-32 mb-3" /><div className="skeleton h-10 w-full" /></div>
        ) : !d ? (
          <div className="card text-center text-slate-400 py-10 text-sm">Insights will appear once you start using your money.</div>
        ) : (
          <>
            {/* In / Out summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="card">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                  <TrendingUp size={14} /> Money in
                </div>
                <p className="text-xl font-bold mt-1">{$(d.moneyIn)}</p>
                <p className="text-[11px] text-slate-400">{d.vsLastMonth.inChangePct >= 0 ? '▲' : '▼'} {Math.abs(d.vsLastMonth.inChangePct)}% vs last month</p>
              </div>
              <div className="card">
                <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                  <TrendingDown size={14} /> Money out
                </div>
                <p className="text-xl font-bold mt-1">{$(d.moneyOut)}</p>
                <p className="text-[11px] text-slate-400">{d.vsLastMonth.outChangePct >= 0 ? '▲' : '▼'} {Math.abs(d.vsLastMonth.outChangePct)}% vs last month</p>
              </div>
            </div>

            {/* Savings rate */}
            <div className="card bg-gradient-to-br from-[#1a3a6b] to-[#1a56db] text-white">
              <p className="text-xs text-white/70">Kept this month (savings rate)</p>
              <div className="flex items-end justify-between mt-1">
                <p className="text-3xl font-bold">{d.savingsRatePct}%</p>
                <p className="text-sm text-white/80">{$(d.net)} left over</p>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full bg-emerald-400" style={{ width: `${Math.min(100, d.savingsRatePct)}%` }} />
              </div>
            </div>

            {/* Tips */}
            {(d.tips ?? []).map((t: any, i: number) => (
              <div key={i} className="card flex gap-3">
                <span className="text-xl flex-shrink-0">{t.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{t.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{t.body}</p>
                </div>
              </div>
            ))}

            {/* Spending breakdown */}
            {(d.breakdown ?? []).length > 0 && (
              <div className="card">
                <p className="font-semibold text-sm mb-3">Where your money went</p>
                <div className="space-y-2.5">
                  {d.breakdown.map((b: any) => (
                    <div key={b.type}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="capitalize text-slate-600 dark:text-slate-300">{b.type.toLowerCase()}</span>
                        <span className="font-semibold">{$(b.amount)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                        <div className="h-full bg-grad-brand" style={{ width: `${(b.amount / breakdownMax) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA to act on a tip */}
            <button onClick={() => router.push('/savings')}
              className="w-full flex items-center justify-center gap-2 bg-grad-brand text-white font-semibold py-3.5 rounded-2xl shadow-ds-btn active:scale-[0.98] transition-transform">
              Grow your savings <ArrowRight size={18} />
            </button>
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
