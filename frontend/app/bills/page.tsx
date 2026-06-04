'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Search, CheckCircle2 } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import PinInput from '../../components/PinInput';
import { formatTzs } from '../../lib/utils';

async function billsApi(path: string, body?: any) {
  const token = (sessionStorage.getItem('olomipay_at') || sessionStorage.getItem('olomipay_rt'));
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bills${path}`, {
    method:  body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

type Step = 'select' | 'enter' | 'confirm' | 'pin' | 'success';

const CATEGORY_COLORS: Record<string, string> = {
  Electricity: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600',
  Water:       'bg-blue-100  dark:bg-blue-900/30  text-blue-600',
  TV:          'bg-purple-100 dark:bg-purple-900/30 text-purple-600',
  Airtime:     'bg-green-100  dark:bg-green-900/30  text-green-600',
  Education:   'bg-rose-100   dark:bg-rose-900/30   text-rose-600',
};

export default function BillsPage() {
  const router = useRouter();
  const [step,         setStep]         = useState<Step>('select');
  const [billers,      setBillers]      = useState<any[]>([]);
  const [selected,     setSelected]     = useState<any>(null);
  const [accountNo,    setAccountNo]    = useState('');
  const [accountInfo,  setAccountInfo]  = useState<any>(null);
  const [amountTzs,    setAmountTzs]    = useState('');
  const [pin,          setPin]          = useState('');
  const [loading,      setLoading]      = useState(false);
  const [receipt,      setReceipt]      = useState<any>(null);
  const [search,       setSearch]       = useState('');

  useEffect(() => {
    billsApi('/billers').then(r => r.success && setBillers(r.data.billers));
  }, []);

  const filtered = billers.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.category.toLowerCase().includes(search.toLowerCase())
  );

  async function handleValidate() {
    setLoading(true);
    const r = await billsApi('/validate', { billerId: selected.id, accountNumber: accountNo });
    setLoading(false);
    if (r.success) { setAccountInfo(r.data); setStep('confirm'); }
    else toast.error(r.error ?? 'Validation failed');
  }

  async function handlePay() {
    setLoading(true);
    const r = await billsApi('/pay', {
      billerId: selected.id, accountNumber: accountNo,
      amountTzs: parseInt(amountTzs), pin,
    });
    setLoading(false);
    if (r.success) { setReceipt(r.data); setStep('success'); }
    else toast.error(r.error ?? 'Payment failed');
    setPin('');
  }

  function reset() { setStep('select'); setSelected(null); setAccountNo(''); setAccountInfo(null); setAmountTzs(''); setPin(''); setReceipt(null); }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 pb-24">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={40} className="text-success" />
          </div>
          <h2 className="text-2xl font-bold">{selected?.name} Paid! ✅</h2>
          {receipt?.token && (
            <div className="card bg-yellow-50 dark:bg-yellow-900/20">
              <p className="text-xs font-medium text-yellow-600 mb-1">LUKU Token</p>
              <p className="text-2xl font-mono font-bold text-yellow-800 dark:text-yellow-400 tracking-wider">
                {receipt.token}
              </p>
              <p className="text-xs text-yellow-600/70 mt-1">Save this token to load electricity</p>
            </div>
          )}
          <p className="text-sm text-slate-500">
            Reference: <span className="font-mono">{receipt?.reference}</span>
          </p>
          <button onClick={reset} className="btn-primary w-full">Pay Another Bill</button>
          <button onClick={() => router.push('/dashboard')} className="btn-secondary w-full">Home</button>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
        <button onClick={() => step === 'select' ? router.back() : setStep('select')}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">
          {step === 'select' ? 'Pay Bills' : selected?.name ?? 'Bill Payment'}
        </h1>
      </div>

      <div className="px-5 max-w-md mx-auto mt-4 space-y-4">
        {step === 'select' && (
          <>
            <div className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 min-h-[48px]">
              <Search size={16} className="text-slate-400" />
              <input placeholder="Search billers…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none py-3" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {filtered.map(biller => (
                <button key={biller.id}
                  onClick={() => { setSelected(biller); setStep('enter'); }}
                  className="card text-left active:scale-95 transition-transform hover:shadow-md"
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-3 ${CATEGORY_COLORS[biller.category] ?? 'bg-slate-100'}`}>
                    {biller.logo}
                  </div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-tight">{biller.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{biller.category}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'enter' && (
          <div className="space-y-4">
            <div className="card">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-3 ${CATEGORY_COLORS[selected.category]}`}>
                {selected.logo}
              </div>
              <h2 className="font-semibold text-lg">{selected.name}</h2>
              <p className="text-sm text-slate-400">{selected.description}</p>
            </div>
            <div className="card space-y-3">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Account / Meter Number</label>
              <input type="text" placeholder="e.g. 12345678" value={accountNo}
                onChange={e => setAccountNo(e.target.value)} className="input" autoFocus />
            </div>
            <div className="card space-y-3">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Amount (TZS)</label>
              <input type="number" placeholder={`Min ${selected.minAmount.toLocaleString()}`}
                value={amountTzs} onChange={e => setAmountTzs(e.target.value)} className="input text-xl font-bold" />
              <div className="flex gap-2 flex-wrap">
                {[5000, 10000, 20000, 50000].filter(a => a >= selected.minAmount).map(preset => (
                  <button key={preset} onClick={() => setAmountTzs(String(preset))}
                    className={`text-xs px-3 py-1.5 rounded-full min-h-[32px] transition-colors ${
                      parseInt(amountTzs) === preset ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'
                    }`}>
                    {(preset/1000).toFixed(0)}K
                  </button>
                ))}
              </div>
            </div>
            <button onClick={handleValidate} disabled={!accountNo || !amountTzs || loading}
              className="btn-primary w-full">
              {loading ? 'Validating…' : 'Continue'}
            </button>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="card space-y-3">
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Payment Summary</p>
              {[
                ['Biller',   selected.name],
                ['Account',  accountNo],
                ['Name',     accountInfo?.accountName],
                ['Amount',   formatTzs(parseInt(amountTzs))],
              ].filter(([,v]) => v).map(([label, value]) => (
                <div key={label as string} className="flex justify-between text-sm">
                  <span className="text-slate-500">{label as string}</span>
                  <span className="font-medium">{value as string}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setStep('pin')} className="btn-primary w-full">Enter PIN to Pay</button>
          </div>
        )}

        {step === 'pin' && (
          <div className="flex flex-col items-center gap-6 mt-8">
            <div className="card w-full text-center">
              <p className="text-sm text-slate-500 mb-1">Paying {selected.name}</p>
              <p className="text-3xl font-bold">{formatTzs(parseInt(amountTzs))}</p>
            </div>
            <p className="text-sm text-slate-500">Enter PIN to confirm</p>
            <PinInput value={pin} onChange={setPin} autoFocus />
            <button onClick={handlePay} disabled={pin.length < 6 || loading}
              className="btn-primary w-full">
              {loading ? 'Processing…' : 'Pay Now'}
            </button>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
