'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Lock, TrendingUp, CheckCircle2, Trophy } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import PageHeader from '../../components/PageHeader';
import PinInput from '../../components/PinInput';
import { formatUsdc } from '../../lib/utils';

async function stakeApi(path: string, method = 'GET', body?: any) {
  const token = (localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt'));
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/stake${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const POOL_COLORS = ['bg-blue-500', 'bg-purple-500', 'bg-amber-500'];

export default function StakePage() {
  const router = useRouter();
  const [pools,    setPools]    = useState<any[]>([]);
  const [position, setPosition] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [amount,   setAmount]   = useState('');
  const [pin,      setPin]      = useState('');
  const [step,     setStep]     = useState<'select'|'amount'|'pin'|'success'>('select');
  const [loading,  setLoading]  = useState(false);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      stakeApi('/pools').then(r => r.success && setPools(r.data.pools)),
      stakeApi('/position').then(r => r.success && setPosition(r.data)),
      stakeApi('/leaderboard').then(r => r.success && setLeaderboard(r.data.leaderboard)),
    ]);
  }, []);

  async function handleStake() {
    setLoading(true);
    const r = await stakeApi('/create', 'POST', {
      amountUsdc: parseFloat(amount), lockPeriodDays: selected.days, pin,
    });
    setLoading(false);
    if (r.success) { setStep('success'); stakeApi('/position').then(r => r.success && setPosition(r.data)); }
    else toast.error(r.error ?? 'Failed');
    setPin('');
  }

  async function handleUnstake() {
    const pin = prompt('Enter your PIN to unstake:');
    if (!pin) return;
    const r = await stakeApi('/unstake', 'POST', { pin });
    if (r.success) {
      toast.success(`Unstaked! Received ${formatUsdc(r.data.payout)}`);
      setPosition(null);
    } else toast.error(r.error ?? 'Failed');
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 bg-slate-50 dark:bg-slate-900 pb-24">
        <div className="text-center space-y-5 max-w-sm">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto text-4xl">🔒</div>
          <h2 className="text-2xl font-bold">Staked! Earning {selected?.apy} APY</h2>
          <p className="text-slate-500 text-sm">
            Your {formatUsdc(parseFloat(amount))} is locked for {selected?.days} days.
            Yield accrues every second.
          </p>
          <button onClick={() => { setStep('select'); setAmount(''); setSelected(null); }} className="btn-primary w-full">
            View Position
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <PageHeader eyebrow="Grow" title="Earn"
        onBack={() => step === 'select' ? router.back() : setStep('select')} />

      <div className="px-5 max-w-md mx-auto mt-4 space-y-4">
        {/* Active position */}
        {position?.hasPosition && (
          <div className="card bg-gradient-to-br from-amber-500 to-orange-600 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Lock size={16} />
              <span className="text-sm font-medium">Active Stake — {position.apy}</span>
              {position.isUnlocked && <span className="ml-auto text-xs bg-white/20 px-2 py-0.5 rounded-full">Unlocked ✓</span>}
            </div>
            <p className="text-3xl font-bold">{formatUsdc(position.amountUsdc)}</p>
            <p className="text-sm text-white/80 mt-1">
              +{formatUsdc(position.yieldAccrued)} earned
            </p>
            <div className="mt-3 flex items-center justify-between text-xs text-white/70">
              <span>{position.isUnlocked ? 'Ready to withdraw' : `${position.daysRemaining} days remaining`}</span>
              <button onClick={handleUnstake} className="bg-white/20 px-3 py-1.5 rounded-xl font-medium min-h-[32px]">
                Unstake
              </button>
            </div>
          </div>
        )}

        {step === 'select' && !position?.hasPosition && (
          <>
            <p className="text-sm text-slate-500">Choose a lock period to start earning:</p>
            {pools.map((pool, i) => (
              <button key={pool.days} onClick={() => { setSelected(pool); setStep('amount'); }}
                className="card w-full text-left active:scale-[0.98] transition-transform hover:shadow-md">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl ${POOL_COLORS[i]} flex items-center justify-center`}>
                    <TrendingUp size={22} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{pool.label}</p>
                      <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full text-slate-500">{pool.badge}</span>
                    </div>
                    <p className="text-sm text-slate-500">{pool.days}-day lock period</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-success">{pool.apy}</p>
                    <p className="text-xs text-slate-400">APY</p>
                  </div>
                </div>

                {/* Yield projector */}
                <div className="mt-3 bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-xs text-slate-500 space-y-1">
                  {[100, 500, 1000].map(amt => (
                    <div key={amt} className="flex justify-between">
                      <span>Stake ${amt}</span>
                      <span className="text-success font-medium">
                        +{formatUsdc(amt * (pool.apyBps / 10000) * pool.days / 365)}
                      </span>
                    </div>
                  ))}
                </div>
              </button>
            ))}

            {/* Leaderboard */}
            {leaderboard.length > 0 && (
              <div className="card">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3 flex items-center gap-2">
                  <Trophy size={14} className="text-amber-500" /> Top Stakers
                </h3>
                {leaderboard.slice(0, 5).map((s, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <span className="text-sm font-bold text-slate-400 w-5">#{i + 1}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{formatUsdc(s.amountUsdc)}</p>
                      <p className="text-xs text-slate-400">{s.lockDays} days · {(s.apyBps / 100).toFixed(1)}% APY</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {step === 'amount' && selected && (
          <div className="space-y-4">
            <div className="card bg-gradient-to-br from-slate-800 to-slate-900 text-white">
              <p className="text-sm text-white/70 mb-1">{selected.label} Lock</p>
              <p className="text-3xl font-bold text-amber-400">{selected.apy} APY</p>
              <p className="text-xs text-white/50 mt-1">Early exit: 1% penalty</p>
            </div>
            <div className="card space-y-3">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Stake amount (USD)</label>
              <input type="number" placeholder="0.00" value={amount}
                onChange={e => setAmount(e.target.value)} className="input text-2xl font-bold" autoFocus />
              {parseFloat(amount) > 0 && (
                <p className="text-xs text-success">
                  You'll earn ~{formatUsdc(parseFloat(amount) * (selected.apyBps / 10000) * selected.days / 365)}
                </p>
              )}
            </div>
            <button onClick={() => setStep('pin')} disabled={parseFloat(amount) <= 0}
              className="btn-primary w-full">Continue</button>
          </div>
        )}

        {step === 'pin' && (
          <div className="flex flex-col items-center gap-6 mt-8">
            <div className="card w-full text-center">
              <p className="text-sm text-slate-500 mb-1">Staking for {selected?.days} days at {selected?.apy}</p>
              <p className="text-3xl font-bold">{formatUsdc(parseFloat(amount))}</p>
            </div>
            <p className="text-sm text-slate-500">Enter PIN to confirm</p>
            <PinInput value={pin} onChange={setPin} autoFocus />
            <button onClick={handleStake} disabled={pin.length < 6 || loading} className="btn-primary w-full">
              {loading ? 'Staking…' : 'Stake & Lock'}
            </button>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
