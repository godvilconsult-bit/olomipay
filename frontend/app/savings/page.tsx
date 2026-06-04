'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, TrendingUp, Info, CheckCircle2 } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import PinInput from '../../components/PinInput';
import { wallet } from '../../lib/api';
import { formatUsdc } from '../../lib/utils';

const APY = 4.5;

async function savingsApi(path: string, body?: any) {
  const token = typeof window !== 'undefined' ? (sessionStorage.getItem('olomipay_at') || sessionStorage.getItem('olomipay_rt')) : null;
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/savings${path}`, {
    method:  body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

type Tab    = 'overview' | 'deposit' | 'withdraw';
type Step   = 'amount' | 'pin' | 'success';

export default function SavingsPage() {
  const router = useRouter();
  const [tab,      setTab]      = useState<Tab>('overview');
  const [step,     setStep]     = useState<Step>('amount');
  const [position, setPosition] = useState<any>(null);
  const [balance,  setBalance]  = useState('0');
  const [amount,   setAmount]   = useState('');
  const [pin,      setPin]      = useState('');
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    savingsApi('/balance').then(r => r.success && setPosition(r.data));
    wallet.balance().then(r => setBalance(r.balance?.usdc ?? '0')).catch(() => {});
  }, []);

  const amountNum = parseFloat(amount) || 0;
  const projectedMonthly = amountNum * (APY / 100) / 12;

  async function handleDeposit() {
    setLoading(true);
    const r = await savingsApi('/deposit', { amountUsdc: amountNum, pin });
    setLoading(false);
    if (r.success) { setStep('success'); savingsApi('/balance').then(d => d.success && setPosition(d.data)); }
    else toast.error(r.error ?? 'Failed');
    setPin('');
  }

  async function handleWithdraw() {
    setLoading(true);
    const r = await savingsApi('/withdraw', { amountUsdc: amountNum, pin });
    setLoading(false);
    if (r.success) { setStep('success'); savingsApi('/balance').then(d => d.success && setPosition(d.data)); }
    else toast.error(r.error ?? 'Failed');
    setPin('');
  }

  function resetFlow() { setStep('amount'); setAmount(''); setPin(''); }

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">Savings</h1>
        <span className="ml-auto text-xs bg-green-100 text-green-700 font-semibold px-2 py-1 rounded-full">
          {APY}% APY
        </span>
      </div>

      <div className="px-5 max-w-md mx-auto mt-4 space-y-4">
        {/* Savings balance card */}
        <div className="card bg-gradient-to-br from-green-600 to-emerald-700 text-white relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/5 rounded-full" />
          <p className="text-sm text-white/70 mb-1">Savings Balance</p>
          <p className="text-4xl font-bold mb-1">
            {formatUsdc(position?.principal ?? 0)}
          </p>
          <p className="text-sm text-white/70">
            + {formatUsdc(position?.yieldEarned ?? 0)} yield earned 🌱
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs text-white/60">
            <TrendingUp size={12} />
            <span>Projected this month: {formatUsdc(position?.projectedMonthly ?? 0)}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-2xl p-1 gap-1">
          {(['overview', 'deposit', 'withdraw'] as Tab[]).map(t => (
            <button key={t} onClick={() => { setTab(t); resetFlow(); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors capitalize min-h-[40px] ${
                tab === t ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Overview */}
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="card">
              <h3 className="font-semibold mb-3">How it works</h3>
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
                {[
                  ['🌱', 'Deposit USDC into your savings vault'],
                  ['📈', `Earn ${APY}% APY — accrues every second`],
                  ['💸', 'Withdraw anytime (best after 30 days)'],
                  ['🔒', 'Secured by smart contract · settled on-chain'],
                ].map(([icon, text]) => (
                  <div key={text as string} className="flex items-start gap-3">
                    <span className="text-lg">{icon}</span>
                    <span>{text as string}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Yield calculator */}
            <div className="card">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                Yield Calculator <Info size={14} className="text-slate-400" />
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">If I save</label>
                  <input type="number" placeholder="100" value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="input" />
                </div>
                {amountNum > 0 && (
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-4 space-y-2 text-sm">
                    {[
                      ['1 month',  (amountNum * APY / 100 / 12).toFixed(4)],
                      ['3 months', (amountNum * APY / 100 / 4).toFixed(4)],
                      ['1 year',   (amountNum * APY / 100).toFixed(4)],
                    ].map(([period, yield_]) => (
                      <div key={period} className="flex justify-between">
                        <span className="text-slate-500">{period}</span>
                        <span className="font-semibold text-green-700 dark:text-green-400">
                          +{formatUsdc(yield_)} USDC
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Deposit */}
        {tab === 'deposit' && step === 'amount' && (
          <div className="space-y-4">
            <div className="card">
              <p className="text-xs text-slate-500 mb-1">Available wallet balance</p>
              <p className="text-lg font-semibold">{formatUsdc(balance)}</p>
            </div>
            <div className="card space-y-3">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Deposit amount (USDC)</label>
              <input type="number" placeholder="0.00" value={amount}
                onChange={e => setAmount(e.target.value)} className="input text-2xl font-bold" autoFocus />
              {amountNum > 0 && (
                <p className="text-xs text-green-600">
                  You'll earn ~{formatUsdc(projectedMonthly)} USDC per month
                </p>
              )}
            </div>
            <button onClick={() => setStep('pin')} disabled={amountNum <= 0}
              className="btn-primary w-full">Continue</button>
          </div>
        )}

        {tab === 'deposit' && step === 'pin' && (
          <div className="flex flex-col items-center gap-6 mt-8">
            <div className="card w-full text-center">
              <p className="text-sm text-slate-500 mb-1">Depositing into savings</p>
              <p className="text-3xl font-bold text-green-600">{formatUsdc(amountNum)}</p>
            </div>
            <p className="text-sm text-slate-500">Enter PIN to confirm</p>
            <PinInput value={pin} onChange={setPin} autoFocus />
            <button onClick={handleDeposit} disabled={pin.length < 6 || loading}
              className="btn-primary w-full bg-green-600 hover:bg-green-700">
              {loading ? 'Depositing…' : 'Deposit to Savings'}
            </button>
          </div>
        )}

        {(tab === 'deposit' || tab === 'withdraw') && step === 'success' && (
          <div className="flex flex-col items-center gap-6 mt-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 size={40} className="text-green-600" />
            </div>
            <h2 className="text-2xl font-bold">
              {tab === 'deposit' ? 'Deposited! 🌱' : 'Withdrawn!'}
            </h2>
            <p className="text-slate-500 text-sm">
              {tab === 'deposit' ? 'Your savings are growing.' : 'Funds sent to your wallet.'}
            </p>
            <button onClick={() => { setTab('overview'); resetFlow(); }} className="btn-primary w-full">
              Back to Savings
            </button>
          </div>
        )}

        {/* Withdraw */}
        {tab === 'withdraw' && step === 'amount' && (
          <div className="space-y-4">
            {(position?.depositedAt) && (
              (() => {
                const days = (Date.now() - new Date(position.depositedAt).getTime()) / 86_400_000;
                return days < 30 ? (
                  <div className="card bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      ⚠️ Early withdrawal — deposited {Math.floor(days)} days ago
                    </p>
                    <p className="text-xs text-amber-600/80 mt-1">
                      For best returns, keep savings for 30+ days.
                    </p>
                  </div>
                ) : null;
              })()
            )}
            <div className="card space-y-3">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Withdraw amount (USDC)</label>
              <input type="number" placeholder="0.00" value={amount}
                onChange={e => setAmount(e.target.value)} className="input text-2xl font-bold" autoFocus />
              <p className="text-xs text-slate-500">
                Available: {formatUsdc((position?.principal ?? 0) + (position?.yieldEarned ?? 0))}
              </p>
            </div>
            <button onClick={() => setStep('pin')} disabled={amountNum <= 0}
              className="btn-primary w-full">Continue</button>
          </div>
        )}

        {tab === 'withdraw' && step === 'pin' && (
          <div className="flex flex-col items-center gap-6 mt-8">
            <div className="card w-full text-center">
              <p className="text-sm text-slate-500 mb-1">Withdrawing from savings</p>
              <p className="text-3xl font-bold">{formatUsdc(amountNum)}</p>
            </div>
            <p className="text-sm text-slate-500">Enter PIN to confirm</p>
            <PinInput value={pin} onChange={setPin} autoFocus />
            <button onClick={handleWithdraw} disabled={pin.length < 6 || loading}
              className="btn-primary w-full">
              {loading ? 'Withdrawing…' : 'Withdraw'}
            </button>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
