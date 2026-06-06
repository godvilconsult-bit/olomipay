'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, TrendingUp, Calendar, CheckCircle2 } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import PinInput from '../../components/PinInput';
import { formatUsdc } from '../../lib/utils';

async function bondsApi(path: string, method = 'GET', body?: any) {
  const token = (localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt'));
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bonds${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export default function InvestPage() {
  const router   = useRouter();
  const [bonds,     setBonds]     = useState<any[]>([]);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [selected,  setSelected]  = useState<any>(null);
  const [amount,    setAmount]    = useState('');
  const [pin,       setPin]       = useState('');
  const [step,      setStep]      = useState<'list'|'amount'|'pin'|'success'>('list');
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      bondsApi('/available').then(r => r.success && setBonds(r.data.bonds)),
      bondsApi('/portfolio').then(r => r.success && setPortfolio(r.data)),
    ]).finally(() => setLoading(false));
  }, []);

  async function handleInvest() {
    const r = await bondsApi('/invest', 'POST', {
      bondId: selected.id, amountUsdc: parseFloat(amount), pin,
    });
    if (r.success) { setStep('success'); bondsApi('/portfolio').then(r => r.success && setPortfolio(r.data)); }
    else toast.error(r.error ?? 'Investment failed');
    setPin('');
  }

  async function handleRedeem(bondId: string) {
    const pin = prompt('Enter PIN to redeem bond:');
    if (!pin) return;
    const r = await bondsApi('/redeem', 'POST', { bondId, pin });
    if (r.success) toast.success(`Redeemed! Received ${formatUsdc(r.data.payout)}`);
    else toast.error(r.error ?? 'Failed');
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 bg-slate-50 dark:bg-slate-900 pb-24">
        <div className="text-center space-y-5 max-w-sm">
          <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={40} className="text-success" />
          </div>
          <h2 className="text-2xl font-bold">Investment Confirmed! 📈</h2>
          <p className="text-slate-500">${amount} invested in {selected?.name}</p>
          <p className="text-xs text-slate-400">
            Projected annual return: {formatUsdc(parseFloat(amount) * (selected?.couponRateBps / 10000))}
          </p>
          <button onClick={() => { setStep('list'); setAmount(''); setSelected(null); }} className="btn-primary w-full">
            View Portfolio
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
        <button onClick={() => step === 'list' ? router.back() : setStep('list')}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">Bonds & Investment</h1>
      </div>

      <div className="px-5 max-w-md mx-auto mt-4 space-y-4">
        {/* Portfolio summary */}
        {portfolio && portfolio.totalInvested > 0 && (
          <div className="card bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
            <p className="text-sm text-white/70 mb-1">My Portfolio</p>
            <p className="text-3xl font-bold">{formatUsdc(portfolio.totalInvested)}</p>
            <p className="text-sm text-white/70 mt-1">
              +{formatUsdc(portfolio.totalAccrued)} accrued interest
            </p>
            <div className="mt-3 space-y-2">
              {portfolio.holdings?.filter((h: any) => h.isMatured).map((h: any) => (
                <div key={h.id} className="flex items-center justify-between bg-white/10 rounded-xl px-3 py-2">
                  <span className="text-xs">Matured: {h.bond.name.slice(0, 20)}</span>
                  <button onClick={() => handleRedeem(h.bondId)}
                    className="text-xs bg-white text-blue-700 font-bold px-3 py-1 rounded-full">
                    Redeem
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'list' && (
          <>
            <p className="text-sm text-slate-500 font-medium">Available Bonds</p>
            {loading ? (
              <div className="space-y-3">{[1,2].map(i => <div key={i} className="skeleton h-36 rounded-3xl" />)}</div>
            ) : bonds.length === 0 ? (
              <div className="card text-center py-8 text-slate-400">
                <p>No bonds available right now.</p>
                <p className="text-xs mt-1">Check back soon for new government Treasury Bills.</p>
              </div>
            ) : (
              bonds.map(bond => (
                <div key={bond.id} className="card space-y-3 active:scale-[0.98] transition-transform">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xl">
                      🏦
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-sm leading-tight">{bond.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{bond.description?.slice(0, 60)}...</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-success">{bond.apyLabel}</p>
                      <p className="text-xs text-slate-400">APY</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs text-slate-500">
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-2 text-center">
                      <p className="text-slate-400">Min</p>
                      <p className="font-semibold">{formatUsdc(bond.minInvestment)}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-2 text-center">
                      <p className="text-slate-400">Matures</p>
                      <p className="font-semibold">{bond.daysToMaturity}d</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-2 text-center">
                      <p className="text-slate-400">Investors</p>
                      <p className="font-semibold">{bond.investorCount}</p>
                    </div>
                  </div>

                  {/* Yield projector */}
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-xs space-y-1">
                    <p className="font-medium text-success mb-1">Projected returns:</p>
                    {[50, 100, 500].filter(a => a >= bond.minInvestment).map(amt => (
                      <div key={amt} className="flex justify-between">
                        <span className="text-slate-500">Invest ${amt}</span>
                        <span className="font-semibold text-success">
                          +{formatUsdc(amt * (bond.couponRateBps / 10000))} / year
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Funded: {formatUsdc(bond.invested)}</span>
                      <span>Available: {formatUsdc(bond.availableUsdc)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full">
                      <div className="h-full bg-success rounded-full"
                        style={{ width: `${Math.min((bond.invested / bond.totalSupply) * 100, 100)}%` }} />
                    </div>
                  </div>

                  <button onClick={() => { setSelected(bond); setStep('amount'); }}
                    className="btn-primary w-full text-sm">
                    Invest Now
                  </button>
                </div>
              ))
            )}
          </>
        )}

        {step === 'amount' && selected && (
          <div className="space-y-4">
            <div className="card bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
              <p className="text-sm text-white/70">{selected.name}</p>
              <p className="text-2xl font-bold text-amber-300">{selected.apyLabel} APY</p>
              <p className="text-xs text-white/60 mt-1">Matures in {selected.daysToMaturity} days</p>
            </div>
            <div className="card space-y-3">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Investment amount (USD)</label>
              <input type="number" placeholder={`Min ${selected.minInvestment}`}
                value={amount} onChange={e => setAmount(e.target.value)}
                className="input text-2xl font-bold" autoFocus />
              {parseFloat(amount) >= selected.minInvestment && (
                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Annual return</span>
                    <span className="font-bold text-success">
                      +{formatUsdc(parseFloat(amount) * (selected.couponRateBps / 10000))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">At maturity ({selected.daysToMaturity}d)</span>
                    <span className="font-semibold text-success">
                      +{formatUsdc(parseFloat(amount) * (selected.couponRateBps / 10000) * selected.daysToMaturity / 365)}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => setStep('pin')}
              disabled={parseFloat(amount) < selected.minInvestment}
              className="btn-primary w-full">Continue</button>
          </div>
        )}

        {step === 'pin' && (
          <div className="flex flex-col items-center gap-6 mt-8">
            <div className="card w-full text-center">
              <p className="text-sm text-slate-500 mb-1">Investing in {selected?.name}</p>
              <p className="text-3xl font-bold">{formatUsdc(parseFloat(amount))}</p>
            </div>
            <p className="text-sm text-slate-500">Enter PIN to confirm</p>
            <PinInput value={pin} onChange={setPin} autoFocus />
            <button onClick={handleInvest} disabled={pin.length < 6} className="btn-primary w-full">
              Confirm Investment
            </button>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
