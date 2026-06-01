'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, TrendingDown, TrendingUp, Shield } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import { formatTzs, formatUsdc } from '../../lib/utils';

async function pricelockApi(path: string) {
  const token = (sessionStorage.getItem('olomipay_at') || sessionStorage.getItem('olomipay_rt'));
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pricelock${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export default function ProtectPage() {
  const router  = useRouter();
  const [amount, setAmount]     = useState('100000');
  const [comparison, setComp]   = useState<any>(null);
  const [history, setHistory]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    pricelockApi('/rate-history').then(r => {
      if (r.success) setHistory(r.data.history);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (parseFloat(amount) > 0) {
      const t = setTimeout(() => {
        pricelockApi(`/comparison?amountTzs=${amount}`)
          .then(r => r.success && setComp(r.data));
      }, 500);
      return () => clearTimeout(t);
    }
  }, [amount]);

  // Simple SVG chart
  function MiniChart() {
    if (history.length < 2) return null;
    const rates = history.slice(-90).map(h => h.usdToTzs);
    const min   = Math.min(...rates);
    const max   = Math.max(...rates);
    const w = 300, h = 80;
    const points = rates.map((r, i) => {
      const x = (i / (rates.length - 1)) * w;
      const y = h - ((r - min) / (max - min)) * h;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke="#dc2626" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-24">
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">USD Protection</h1>
        <Shield size={18} className="text-success ml-auto" />
      </div>

      <div className="px-5 max-w-md mx-auto mt-4 space-y-4">
        {/* Hero */}
        <div className="card bg-gradient-to-br from-green-600 to-emerald-800 text-white">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={20} />
            <span className="font-semibold">Your savings are USD-protected</span>
          </div>
          <p className="text-sm text-white/80">
            While TZS loses value every year, your USDC maintains its USD value.
            See the difference below.
          </p>
        </div>

        {/* TZS devaluation chart */}
        {!loading && history.length > 0 && (
          <div className="card">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1">
              TZS/USD Rate — Last 90 Days
            </h3>
            <p className="text-xs text-slate-400 mb-3">Higher = more TZS needed to buy $1 (TZS is weaker)</p>
            <div className="bg-red-50 dark:bg-red-900/10 rounded-2xl p-3 mb-2">
              <MiniChart />
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>90 days ago: {formatTzs(history[Math.max(0, history.length - 90)]?.usdToTzs ?? 0)}/USD</span>
              <span className="text-danger font-medium">Now: {formatTzs(history[history.length - 1]?.usdToTzs ?? 0)}/USD</span>
            </div>
          </div>
        )}

        {/* Calculator */}
        <div className="card space-y-4">
          <h3 className="font-semibold">Protection Calculator</h3>
          <div>
            <label className="text-xs text-slate-500 block mb-1">If I had this in TZS</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="input text-xl font-bold" />
          </div>

          {comparison && (
            <div className="space-y-3">
              {/* Bank */}
              <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown size={16} className="text-danger" />
                  <span className="text-sm font-semibold text-danger">TZS Bank Account (1 year)</span>
                </div>
                <p className="text-lg font-bold text-slate-800 dark:text-slate-200">{formatTzs(comparison.bankAccount.valueNowTzs)}</p>
                <p className="text-xs text-danger mt-1">
                  USD value dropped from ${comparison.bankAccount.valueNowUsd + comparison.bankAccount.usdLost} → ${comparison.bankAccount.valueNowUsd.toFixed(2)}
                </p>
                <p className="text-xs text-danger font-semibold">
                  Lost ${comparison.bankAccount.usdLost.toFixed(2)} in USD value ({comparison.devaluationPct}% devaluation)
                </p>
              </div>

              {/* OlomiPay */}
              <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={16} className="text-success" />
                  <span className="text-sm font-semibold text-success">OlomiPay USDC (1 year)</span>
                </div>
                <p className="text-lg font-bold text-slate-800 dark:text-slate-200">
                  {formatUsdc(comparison.tumaUsdc.usdcHeld)} = {formatTzs(comparison.tumaUsdc.valueNowTzs)}
                </p>
                <p className="text-xs text-success mt-1">
                  USD value maintained: ${comparison.tumaUsdc.valueNowUsd.toFixed(2)}
                </p>
                <p className="text-xs text-success font-semibold">
                  +{formatTzs(comparison.tumaUsdc.gainVsBank)} more than bank account!
                </p>
              </div>

              <p className="text-xs text-center text-slate-400 italic">{comparison.message}</p>
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
