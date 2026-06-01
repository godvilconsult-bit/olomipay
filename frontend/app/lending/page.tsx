'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, TrendingUp, HandCoins, Clock } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import EmptyState from '../../components/EmptyState';
import { formatUsdc, timeAgo } from '../../lib/utils';

async function lendApi(path: string, method = 'GET', body?: any) {
  const token = (sessionStorage.getItem('olomipay_at') || sessionStorage.getItem('olomipay_rt'));
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/lending${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

type Tab = 'borrow' | 'lend' | 'my-loans';

export default function LendingPage() {
  const router    = useRouter();
  const [tab,      setTab]      = useState<Tab>('borrow');
  const [loans,    setLoans]    = useState<any[]>([]);
  const [myLoans,  setMyLoans]  = useState<any>({});
  const [score,    setScore]    = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState({ amountUsdc: '', interestBps: '500', durationDays: '30' });

  useEffect(() => {
    lendApi('/marketplace').then(r => r.success && setLoans(r.data.loans));
    lendApi('/credit-score').then(r => r.success && setScore(r.data));
    lendApi('/my-loans').then(r => r.success && setMyLoans(r.data));
  }, []);

  async function handleListLoan(e: React.FormEvent) {
    e.preventDefault();
    const pin = prompt('Enter PIN:');
    if (!pin) return;
    const r = await lendApi('/list', 'POST', {
      amountUsdc: parseFloat(form.amountUsdc),
      interestBps: parseInt(form.interestBps),
      durationDays: parseInt(form.durationDays),
      pin,
    });
    if (r.success) { toast.success('Loan listed!'); setShowForm(false); lendApi('/marketplace').then(r => r.success && setLoans(r.data.loans)); }
    else toast.error(r.error ?? 'Failed');
  }

  async function handleRequest(loanId: string) {
    const pin = prompt('Enter PIN to request loan:');
    if (!pin) return;
    const r = await lendApi('/request', 'POST', { loanId, pin });
    if (r.success) toast.success(`Loan funded! Due ${new Date(r.data.dueAt).toLocaleDateString()}`);
    else toast.error(r.error ?? 'Failed');
  }

  async function handleRepay(loanId: string) {
    const pin = prompt('Enter PIN to repay:');
    if (!pin) return;
    const r = await lendApi('/repay', 'POST', { loanId, pin });
    if (r.success) { toast.success('Loan repaid! Collateral returned.'); lendApi('/my-loans').then(r => r.success && setMyLoans(r.data)); }
    else toast.error(r.error ?? 'Failed');
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-24">
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold flex-1">Peer Lending</h1>
      </div>

      <div className="px-5 max-w-md mx-auto mt-4 space-y-4">
        {/* Credit score */}
        {score && (
          <div className="card flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white ${
              score.score >= 80 ? 'bg-success' : score.score >= 60 ? 'bg-primary' : score.score >= 40 ? 'bg-amber-500' : 'bg-danger'
            }`}>
              {score.score}
            </div>
            <div>
              <p className="font-semibold">Credit Score: {score.tier}</p>
              <p className="text-xs text-slate-400">Based on your OlomiPay history</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-2xl p-1 gap-1">
          {(['borrow', 'lend', 'my-loans'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-colors capitalize min-h-[40px] ${
                tab === t ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-500'
              }`}>
              {t === 'my-loans' ? 'My Loans' : t === 'borrow' ? 'Borrow' : 'Lend'}
            </button>
          ))}
        </div>

        {/* Borrow tab */}
        {tab === 'borrow' && (
          loans.length === 0 ? (
            <EmptyState icon={HandCoins} title="No loans available yet"
              subtitle="When borrowers post loan requests they'll appear here for you to fund." />
          ) : (
            loans.map(loan => (
              <div key={loan.id} className="card space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-lg">{formatUsdc(loan.amountUsdc)}</p>
                    <p className="text-xs text-slate-400">{loan.durationDays}-day loan</p>
                  </div>
                  <div className="text-right">
                    <p className="text-success font-bold">{(loan.interestBps / 100).toFixed(1)}%</p>
                    <p className="text-xs text-slate-400">interest</p>
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  Collateral required: {formatUsdc(loan.amountUsdc * 0.1)} USDC (10%)
                </div>
                <button onClick={() => handleRequest(loan.id)} className="btn-primary w-full text-sm">
                  Request Loan
                </button>
              </div>
            ))
          )
        )}

        {/* Lend tab */}
        {tab === 'lend' && (
          <>
            {!showForm ? (
              <button onClick={() => setShowForm(true)} className="btn-primary w-full">
                + List a Loan
              </button>
            ) : (
              <form onSubmit={handleListLoan} className="card space-y-3">
                <h3 className="font-semibold">List a Loan</h3>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Amount (USDC)</label>
                  <input type="number" value={form.amountUsdc} onChange={e => setForm(f => ({ ...f, amountUsdc: e.target.value }))} className="input" required />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Interest rate</label>
                  <select value={form.interestBps} onChange={e => setForm(f => ({ ...f, interestBps: e.target.value }))} className="input">
                    <option value="300">3%</option><option value="500">5%</option>
                    <option value="700">7%</option><option value="1000">10%</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Duration</label>
                  <select value={form.durationDays} onChange={e => setForm(f => ({ ...f, durationDays: e.target.value }))} className="input">
                    <option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary flex-1">List Loan</button>
                  <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                </div>
              </form>
            )}
          </>
        )}

        {/* My loans tab */}
        {tab === 'my-loans' && (
          <div className="space-y-3">
            {[...(myLoans.taken ?? [])].map(loan => (
              <div key={loan.id} className="card">
                <div className="flex justify-between">
                  <p className="font-semibold">{formatUsdc(loan.amountUsdc)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    loan.status === 'FUNDED' ? 'bg-amber-100 text-amber-600' :
                    loan.status === 'REPAID' ? 'badge-confirmed' : 'badge-failed'
                  }`}>{loan.status}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Due: {loan.dueAt ? new Date(loan.dueAt).toLocaleDateString() : 'N/A'}</p>
                {loan.status === 'FUNDED' && (
                  <button onClick={() => handleRepay(loan.id)} className="btn-primary w-full text-sm mt-3">
                    Repay {formatUsdc(loan.amountUsdc * (1 + loan.interestBps / 10000))}
                  </button>
                )}
              </div>
            ))}
            {(!myLoans.taken || myLoans.taken.length === 0) && (!myLoans.given || myLoans.given.length === 0) && (
              <EmptyState icon={Clock} title="No active loans"
                subtitle="Loans you borrow or fund will show up here with their repayment status." />
            )}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
