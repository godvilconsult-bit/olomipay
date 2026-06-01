'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, ArrowUpDown, RefreshCw, CheckCircle2 } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import PinInput from '../../components/PinInput';

async function swapApi(path: string, method = 'GET', body?: any) {
  const token = (sessionStorage.getItem('olomipay_at') || sessionStorage.getItem('olomipay_rt'));
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/swap${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const ASSETS = ['USDC', 'XLM'];

export default function SwapPage() {
  const router = useRouter();
  const [fromAsset, setFromAsset] = useState('XLM');
  const [toAsset,   setToAsset]   = useState('USDC');
  const [amount,    setAmount]    = useState('');
  const [quote,     setQuote]     = useState<any>(null);
  const [pin,       setPin]       = useState('');
  const [step,      setStep]      = useState<'form'|'pin'|'success'>('form');
  const [loading,   setLoading]   = useState(false);
  const [hash,      setHash]      = useState('');

  useEffect(() => {
    if (parseFloat(amount) > 0) {
      const t = setTimeout(fetchQuote, 800);
      return () => clearTimeout(t);
    }
  }, [amount, fromAsset, toAsset]);

  async function fetchQuote() {
    const r = await swapApi(`/quote?fromAsset=${fromAsset}&toAsset=${toAsset}&amount=${amount}`);
    if (r.success) setQuote(r.data);
  }

  function flipAssets() {
    setFromAsset(toAsset);
    setToAsset(fromAsset);
    setQuote(null);
  }

  async function handleSwap() {
    setLoading(true);
    const r = await swapApi('/execute', 'POST', {
      fromAsset, toAsset,
      amount:     parseFloat(amount),
      minReceive: quote ? quote.youGet * 0.995 : 0, // 0.5% slippage
      pin,
    });
    setLoading(false);
    if (r.success) { setHash(r.data.hash); setStep('success'); }
    else toast.error(r.error ?? 'Swap failed');
    setPin('');
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 bg-slate-50 dark:bg-slate-900 pb-24">
        <div className="text-center space-y-5 max-w-sm">
          <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={40} className="text-success" />
          </div>
          <h2 className="text-2xl font-bold">Swap Complete!</h2>
          <p className="text-slate-500">
            {amount} {fromAsset} → {quote?.youGet?.toFixed(4)} {toAsset}
          </p>
          <p className="text-xs text-slate-400 font-mono break-all">{hash}</p>
          <button onClick={() => { setStep('form'); setAmount(''); setQuote(null); }} className="btn-primary w-full">
            Swap Again
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-24">
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
        <button onClick={() => step === 'pin' ? setStep('form') : router.back()}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">Currency Swap</h1>
      </div>

      <div className="px-5 max-w-md mx-auto mt-4 space-y-4">
        {step === 'form' && (
          <>
            {/* From */}
            <div className="card space-y-3">
              <label className="text-xs text-slate-500">You send</label>
              <div className="flex gap-2">
                <input type="number" placeholder="0.00" value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="input flex-1 text-2xl font-bold" autoFocus />
                <select value={fromAsset} onChange={e => setFromAsset(e.target.value)} className="input w-24 font-semibold">
                  {ASSETS.filter(a => a !== toAsset).map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
            </div>

            {/* Flip button */}
            <div className="flex justify-center">
              <button onClick={flipAssets}
                className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 shadow flex items-center justify-center">
                <ArrowUpDown size={18} className="text-primary" />
              </button>
            </div>

            {/* To */}
            <div className="card space-y-3">
              <label className="text-xs text-slate-500">You receive</label>
              <div className="flex gap-2 items-center">
                <div className="flex-1 text-2xl font-bold text-success">
                  {quote ? quote.youGet.toFixed(4) : '—'}
                </div>
                <select value={toAsset} onChange={e => setToAsset(e.target.value)} className="input w-24 font-semibold">
                  {ASSETS.filter(a => a !== fromAsset).map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
            </div>

            {/* Quote details */}
            {quote && (
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 space-y-2 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Rate</span>
                  <span>1 {fromAsset} = {quote.rate.toFixed(4)} {toAsset}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Platform fee (0.3%)</span>
                  <span>{quote.platformFee.toFixed(4)} {toAsset}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Max slippage</span>
                  <span>0.5%</span>
                </div>
              </div>
            )}

            <button onClick={() => setStep('pin')} disabled={!quote || parseFloat(amount) <= 0}
              className="btn-primary w-full">
              Swap {fromAsset} → {toAsset}
            </button>
          </>
        )}

        {step === 'pin' && (
          <div className="flex flex-col items-center gap-6 mt-8">
            <div className="card w-full text-center">
              <p className="text-sm text-slate-500 mb-1">Swapping</p>
              <p className="text-2xl font-bold">{amount} {fromAsset}</p>
              <p className="text-sm text-success mt-1">→ ~{quote?.youGet?.toFixed(4)} {toAsset}</p>
            </div>
            <p className="text-sm text-slate-500">Enter PIN to confirm</p>
            <PinInput value={pin} onChange={setPin} autoFocus />
            <button onClick={handleSwap} disabled={pin.length < 6 || loading} className="btn-primary w-full">
              {loading ? 'Swapping…' : 'Confirm Swap'}
            </button>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
