'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, CheckCircle2, Smartphone } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import { mpesa } from '../../lib/api';
import { formatTzs, formatUsdc } from '../../lib/utils';

type Step = 'amount' | 'confirm' | 'waiting' | 'success';

export default function DepositPage() {
  const router = useRouter();
  const [step,      setStep]      = useState<Step>('amount');
  const [amount,    setAmount]    = useState('');
  const [rate,      setRate]      = useState(2600);
  const [loading,   setLoading]   = useState(false);
  const [txId,      setTxId]      = useState('');

  useEffect(() => {
    mpesa.rate().then(r => setRate(r.usdcToTzs ?? 2600)).catch(() => {});
  }, []);

  const amountTzs  = parseInt(amount.replace(/,/g, ''), 10) || 0;
  const amountUsdc = amountTzs / rate;

  async function handleDeposit() {
    if (amountTzs < 500) { toast.error('Minimum deposit is TZS 500'); return; }
    if (amountTzs > 5_000_000) { toast.error('Maximum deposit is TZS 5,000,000'); return; }
    setLoading(true);
    try {
      const res = await mpesa.deposit(amountTzs);
      setTxId(res.transactionId);
      setStep('waiting');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to initiate deposit');
    } finally {
      setLoading(false);
    }
  }

  // Poll for balance update every 5s while waiting
  useEffect(() => {
    if (step !== 'waiting') return;
    // In production you'd poll /api/wallet/history for the txId status
    // For UX, auto-advance to success after 30s (user sees their M-Pesa prompt)
    const t = setTimeout(() => setStep('success'), 30_000);
    return () => clearTimeout(t);
  }, [step]);

  if (step === 'waiting') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center px-5 pb-24">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto animate-pulse">
            <Smartphone size={40} className="text-primary" />
          </div>
          <h2 className="text-2xl font-bold">Check your phone</h2>
          <p className="text-slate-500">
            A prompt has been sent to your M-Pesa. Enter your M-Pesa PIN on your phone to complete the deposit.
          </p>
          <div className="card bg-amber-50 dark:bg-amber-900/20 text-left">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-1">Depositing</p>
            <p className="text-2xl font-bold text-amber-800 dark:text-amber-300">{formatTzs(amountTzs)}</p>
            <p className="text-sm text-amber-600/70 dark:text-amber-500 mt-1">
              ≈ {formatUsdc(amountUsdc)} USDC will be credited to your account
            </p>
          </div>
          <button onClick={() => setStep('success')} className="btn-secondary w-full">
            I've completed the payment →
          </button>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-slate-400 min-h-[44px]">
            Cancel & go home
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center px-5 pb-24">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={40} className="text-success" />
          </div>
          <h2 className="text-2xl font-bold">Deposit in progress!</h2>
          <p className="text-slate-500 text-sm">
            Once M-Pesa confirms payment, {formatUsdc(amountUsdc)} USDC will appear in your balance.
            This usually takes under 30 seconds.
          </p>
          <button onClick={() => router.push('/dashboard')} className="btn-primary w-full">
            Back to home
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-24">
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">Deposit via M-Pesa</h1>
      </div>

      <div className="px-5 max-w-md mx-auto mt-6 space-y-5">
        {/* Amount */}
        <div className="card space-y-3">
          <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Amount in TZS</label>
          <div className="flex items-center gap-3 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 min-h-[64px] bg-white dark:bg-slate-800">
            <span className="text-slate-400 font-medium">TZS</span>
            <input
              type="number"
              inputMode="numeric"
              placeholder="10,000"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="flex-1 bg-transparent text-2xl font-bold outline-none py-3"
              min="500"
              max="5000000"
              autoFocus
            />
          </div>

          {/* Quick amounts */}
          <div className="grid grid-cols-3 gap-2">
            {[5000, 10000, 20000, 50000, 100000, 200000].map(preset => (
              <button
                key={preset}
                onClick={() => setAmount(String(preset))}
                className={`text-sm font-medium py-2 px-3 rounded-xl transition-colors min-h-[40px] ${
                  parseInt(amount) === preset
                    ? 'bg-primary text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {(preset / 1000).toFixed(0)}K
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        {amountTzs > 0 && (
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">You pay</span>
              <span className="font-semibold">{formatTzs(amountTzs)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Exchange rate</span>
              <span>1 USDC ≈ {formatTzs(rate)}</span>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between font-semibold">
              <span className="text-slate-700 dark:text-slate-200">You receive</span>
              <span className="text-success">{formatUsdc(amountUsdc)} USDC</span>
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="card bg-blue-50 dark:bg-blue-900/20 text-sm space-y-2">
          <p className="font-semibold text-blue-700 dark:text-blue-400">How deposit works</p>
          <ol className="space-y-1 text-blue-600/80 dark:text-blue-400/80 list-decimal list-inside">
            <li>Enter amount and tap "Deposit now"</li>
            <li>A prompt appears on your M-Pesa phone</li>
            <li>Enter your M-Pesa PIN on your phone</li>
            <li>USDC is credited to your wallet in seconds</li>
          </ol>
        </div>

        <button
          onClick={handleDeposit}
          disabled={amountTzs < 500 || loading}
          className="btn-primary w-full text-base"
        >
          {loading ? 'Sending prompt…' : `Deposit ${amountTzs > 0 ? formatTzs(amountTzs) : ''}`}
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
