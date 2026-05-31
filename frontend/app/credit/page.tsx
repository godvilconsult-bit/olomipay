'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Share2, Copy, ShieldCheck } from 'lucide-react';
import BottomNav from '../../components/BottomNav';

async function creditApi(path: string, method = 'GET', body?: any) {
  const token = sessionStorage.getItem('olomipay_rt');
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/credit${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#1a56db' : score >= 40 ? '#d97706' : '#dc2626';
  const pct   = (score / 100) * 100;
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-36 h-36">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" strokeWidth="10" />
          <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={`${pct * 2.51} 251`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold" style={{ color }}>{score}</span>
          <span className="text-xs text-slate-400">/100</span>
        </div>
      </div>
    </div>
  );
}

export default function CreditPage() {
  const router  = useRouter();
  const [data,      setData]      = useState<any>(null);
  const [shareUrl,  setShareUrl]  = useState<string | null>(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    creditApi('/score').then(r => { if (r.success) setData(r.data); setLoading(false); });
  }, []);

  async function handleShare() {
    const r = await creditApi('/share', 'POST', { validDays: 7 });
    if (r.success) { setShareUrl(r.data.shareUrl); }
    else toast.error(r.error ?? 'Failed');
  }

  function copyShareUrl() {
    if (shareUrl) { navigator.clipboard.writeText(shareUrl); toast.success('Link copied!'); }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-24">
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">Credit Score</h1>
      </div>

      <div className="px-5 max-w-md mx-auto mt-4 space-y-4">
        {loading ? (
          <div className="skeleton h-48 rounded-3xl" />
        ) : (
          <>
            {/* Score card */}
            <div className="card text-center py-6">
              <ScoreGauge score={data?.score ?? 40} />
              <p className={`text-lg font-bold mt-3 ${
                data?.score >= 80 ? 'text-success' : data?.score >= 60 ? 'text-primary' :
                data?.score >= 40 ? 'text-amber-600' : 'text-danger'
              }`}>{data?.tier}</p>
              <p className="text-sm text-slate-400 mt-1">OlomiPay Credit Score</p>
            </div>

            {/* Score breakdown */}
            <div className="card">
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3">Score Breakdown</h3>
              <div className="space-y-3">
                {data?.breakdown && Object.entries(data.breakdown).map(([key, value]) => {
                  const labels: Record<string, string> = {
                    base: 'Base score', txBonus: 'Transaction history',
                    timeBonus: 'Account age', repaidBonus: 'Loans repaid',
                    defaultPenalty: 'Defaults', savingsBonus: 'Savings activity',
                    stakeBonus: 'Staking activity',
                  };
                  const val = value as number;
                  const isNegative = key === 'defaultPenalty';
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-500">{labels[key] ?? key}</span>
                          <span className={`font-medium ${isNegative && val > 0 ? 'text-danger' : 'text-success'}`}>
                            {isNegative && val > 0 ? '-' : '+'}{val}
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full">
                          <div className={`h-full rounded-full ${isNegative && val > 0 ? 'bg-danger' : 'bg-success'}`}
                            style={{ width: `${Math.min((Math.abs(val) / 25) * 100, 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* How to improve */}
            <div className="card">
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3 flex items-center gap-2">
                <ShieldCheck size={14} className="text-primary" /> Improve your score
              </h3>
              <div className="space-y-2 text-sm text-slate-500">
                <p>• Repay loans on time (+5 pts each)</p>
                <p>• Keep savings active (+5 pts)</p>
                <p>• Transact regularly (+1 pt per 10 txs)</p>
                <p>• Avoid defaults (-20 pts each)</p>
              </div>
            </div>

            {/* Share */}
            <div className="card">
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2 flex items-center gap-2">
                <Share2 size={14} className="text-primary" /> Share credit report
              </h3>
              <p className="text-xs text-slate-400 mb-3">
                Generate a verifiable link to share with banks, landlords, or employers. Valid for 7 days.
              </p>
              {shareUrl ? (
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                  <p className="text-xs font-mono text-slate-600 flex-1 truncate">{shareUrl}</p>
                  <button onClick={copyShareUrl} className="p-1.5 rounded-lg min-h-[32px] min-w-[32px] flex items-center justify-center">
                    <Copy size={14} className="text-slate-500" />
                  </button>
                </div>
              ) : (
                <button onClick={handleShare} className="btn-primary w-full text-sm">
                  Generate Share Link
                </button>
              )}
            </div>
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
