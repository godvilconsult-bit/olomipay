'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import PinInput from '../../components/PinInput';
import { mobile_money, wallet } from '../../lib/api';
import { formatTzs, formatUsdc } from '../../lib/utils';

type Step = 'amount' | 'pin' | 'success';

export default function WithdrawPage() {
  const router = useRouter();
  const [step,      setStep]      = useState<Step>('amount');
  const [amount,    setAmount]    = useState('');
  const [pin,       setPin]       = useState('');
  const [rate,      setRate]      = useState(2600);
  const [balance,   setBalance]   = useState('0');
  const [loading,   setLoading]   = useState(false);
  const [txId,      setTxId]      = useState('');

  useEffect(() => {
    Promise.all([mobile_money.rate(), wallet.balance()]).then(([r, b]) => {
      setRate(r.usdcToTzs ?? 2600);
      setBalance(b.balance.usdc ?? '0');
    }).catch(() => {});
  }, []);

  const amountUsdc = parseFloat(amount) || 0;
  const amountTzs  = amountUsdc * rate;
  const maxUsdc    = parseFloat(balance);
  const isValid    = amountUsdc > 0 && amountUsdc <= maxUsdc;

  async function handleWithdraw() {
    if (pin.length < 6) { toast.error('Enter your PIN'); return; }
    setLoading(true);
    try {
      const res = await mobile_money.withdraw(amountUsdc, pin);
      setTxId(res.transactionId);
      setStep('success');
    } catch (err: any) {
      toast.error(err.message ?? 'Withdrawal failed');
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center px-5 pb-24">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={40} className="text-success" />
          </div>
          <h2 className="text-2xl font-bold">Withdrawal initiated!</h2>
          <p className="text-slate-500 text-sm">
            {formatTzs(amountTzs)} will arrive on your Mobile Money shortly.
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
        <button onClick={() => step === 'pin' ? setStep('amount') : router.back()}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">{step === 'pin' ? 'Confirm withdrawal' : 'Cash Out'}</h1>
      </div>

      <div className="px-5 max-w-md mx-auto mt-6 space-y-5">
        {step === 'amount' && (
          <>
            {/* Balance */}
            <div className="card bg-slate-800 text-white text-center">
              <p className="text-xs text-slate-400 mb-1">Available balance</p>
              <p className="text-3xl font-bold">{formatUsdc(balance)}</p>
            </div>

            {/* Amount */}
            <div className="card space-y-3">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Withdraw (USDC)</label>
              <div className="flex items-center gap-3 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 min-h-[64px]">
                <span className="text-slate-400 font-medium">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="flex-1 bg-transparent text-2xl font-bold outline-none py-3"
                  max={maxUsdc}
                  min="1"
                  autoFocus
                />
                <button
                  onClick={() => setAmount(balance)}
                  className="text-xs text-primary font-semibold min-h-[32px] px-2"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Preview */}
            {amountUsdc > 0 && (
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">USDC deducted</span>
                  <span className="font-semibold text-danger">−{formatUsdc(amountUsdc)}</span>
                </div>
                <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between font-semibold">
                  <span className="text-slate-700 dark:text-slate-200">You receive</span>
                  <span className="text-success">{formatTzs(amountTzs)}</span>
                </div>
              </div>
            )}

            <button
              onClick={() => setStep('pin')}
              disabled={!isValid}
              className="btn-primary w-full text-base"
            >
              Continue
            </button>
          </>
        )}

        {step === 'pin' && (
          <div className="flex flex-col items-center gap-6 mt-8">
            <div className="card w-full text-center">
              <p className="text-sm text-slate-500 mb-1">Withdrawing</p>
              <p className="text-3xl font-bold">{formatUsdc(amountUsdc)}</p>
              <p className="text-sm text-slate-400 mt-1">≈ {formatTzs(amountTzs)} to your mobile money</p>
            </div>
            <p className="text-sm text-slate-500">Enter PIN to confirm</p>
            <PinInput value={pin} onChange={setPin} autoFocus />
            <button
              onClick={handleWithdraw}
              disabled={pin.length < 6 || loading}
              className="btn-primary w-full text-base"
            >
              {loading ? 'Processing…' : 'Withdraw'}
            </button>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
