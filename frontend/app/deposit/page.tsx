'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, CheckCircle2, Smartphone, Building2, ChevronRight } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import { mobile_money } from '../../lib/api';
import { formatTzs, formatUsdc } from '../../lib/utils';

type Step = 'method' | 'amount' | 'waiting' | 'success';

// ── Supported payment methods ─────────────────────────────────────────────────
const MOBILE_MONEY_PROVIDERS = [
  { id: 'mpesa',    name: 'M-Pesa',       flag: '🇰🇪🇹🇿', color: '#00A651', countries: 'Kenya, Tanzania' },
  { id: 'airtel',   name: 'Airtel Money', flag: '🇺🇬🇿🇲🇷🇼', color: '#FF0000', countries: 'Uganda, Zambia, Rwanda, +more' },
  { id: 'mtn',      name: 'MTN MoMo',     flag: '🇬🇭🇺🇬🇿🇦', color: '#FFC107', countries: 'Ghana, Uganda, South Africa, +more' },
  { id: 'orange',   name: 'Orange Money', flag: '🇸🇳🇨🇮🇲🇱', color: '#FF6600', countries: 'Senegal, Côte d\'Ivoire, Mali, +more' },
  { id: 'mpesa_gh', name: 'Vodafone Cash', flag: '🇬🇭',      color: '#E60000', countries: 'Ghana' },
  { id: 'tigo',     name: 'Tigo Pesa',    flag: '🇹🇿🇬🇭',    color: '#00AEEF', countries: 'Tanzania, Ghana' },
  { id: 'zamtel',   name: 'Zamtel Kwacha',flag: '🇿🇲',       color: '#009C44', countries: 'Zambia' },
  { id: 'econet',   name: 'EcoCash',      flag: '🇿🇼',       color: '#FF6600', countries: 'Zimbabwe' },
];

const BANK_PROVIDERS = [
  { id: 'bank_tz',   name: 'Tanzania Banks',       flag: '🇹🇿', desc: 'CRDB, NMB, NBC, Equity, DTB' },
  { id: 'bank_ke',   name: 'Kenya Banks',           flag: '🇰🇪', desc: 'KCB, Equity, Cooperative, NCBA' },
  { id: 'bank_ug',   name: 'Uganda Banks',          flag: '🇺🇬', desc: 'Stanbic, Absa, DFCU, Centenary' },
  { id: 'bank_gh',   name: 'Ghana Banks',           flag: '🇬🇭', desc: 'GCB, Ecobank, Fidelity, Absa' },
  { id: 'bank_za',   name: 'South Africa Banks',    flag: '🇿🇦', desc: 'FNB, Standard, Absa, Nedbank' },
  { id: 'bank_intl', name: 'International Transfer', flag: '🌍', desc: 'SWIFT / SEPA / Wire Transfer' },
];

export default function DepositPage() {
  const router = useRouter();
  const [step,        setStep]        = useState<Step>('method');
  const [method,      setMethod]      = useState<any>(null);
  const [methodType,  setMethodType]  = useState<'mobile'|'bank'>('mobile');
  const [amount,      setAmount]      = useState('');
  const [rate,        setRate]        = useState(2600);
  const [loading,     setLoading]     = useState(false);

  useEffect(() => {
    mobile_money.rate().then(r => setRate(r.usdcToTzs ?? 2600)).catch(() => {});
  }, []);

  const amountNum  = parseInt(amount.replace(/,/g, ''), 10) || 0;
  const amountUsdc = amountNum / rate;
  const fee        = amountUsdc * 0.01;
  const netUsdc    = amountUsdc - fee;

  async function handleDeposit() {
    if (amountNum < 500) { toast.error('Minimum deposit is 500 local currency'); return; }
    setLoading(true);
    try {
      await mobile_money.deposit(amountNum);
      setStep('waiting');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to initiate deposit. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Step: waiting ─────────────────────────────────────────────────────────────
  if (step === 'waiting') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center px-5 pb-24">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto animate-pulse">
            <Smartphone size={40} className="text-primary" />
          </div>
          <h2 className="text-2xl font-bold">Check your phone</h2>
          <p className="text-slate-500">
            A payment prompt has been sent to your {method?.name ?? 'mobile money'} number. Approve it to complete your deposit.
          </p>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-4 text-left space-y-2">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Deposit summary</p>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">You pay</span>
              <span className="font-semibold">{amountNum.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">OlomiPay fee (1%)</span>
              <span className="text-amber-600">− {formatUsdc(fee)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t border-amber-200 pt-2">
              <span>You receive</span>
              <span className="text-green-600">{formatUsdc(netUsdc)} USD</span>
            </div>
          </div>
          <button onClick={() => setStep('success')} className="btn-primary w-full">
            I've approved the payment →
          </button>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-slate-400 min-h-[44px]">
            Cancel
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  // ── Step: success ─────────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center px-5 pb-24">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={40} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-bold">Deposit in progress!</h2>
          <p className="text-slate-500 text-sm">
            Once your {method?.name ?? 'mobile money'} confirms payment, {formatUsdc(netUsdc)} USD will appear in your Olomi Wallet — usually within 30 seconds.
          </p>
          <button onClick={() => router.push('/dashboard')} className="btn-primary w-full">
            Back to home
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  // ── Step: choose method ───────────────────────────────────────────────────────
  if (step === 'method') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-24">
        <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 px-5 py-4 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-slate-100">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold">Add Money</h1>
        </div>

        <div className="px-5 max-w-md mx-auto mt-4 space-y-5">
          <p className="text-slate-500 text-sm">Choose how you want to deposit money into your Olomi Wallet.</p>

          {/* Toggle */}
          <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 rounded-2xl p-1">
            <button onClick={() => setMethodType('mobile')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                methodType === 'mobile' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-400'
              }`}>
              <Smartphone size={15} /> Mobile Money
            </button>
            <button onClick={() => setMethodType('bank')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                methodType === 'bank' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-400'
              }`}>
              <Building2 size={15} /> Bank / Wire
            </button>
          </div>

          {/* Mobile money providers */}
          {methodType === 'mobile' && (
            <div className="space-y-2">
              {MOBILE_MONEY_PROVIDERS.map(p => (
                <button key={p.id} onClick={() => { setMethod(p); setStep('amount'); }}
                  className="w-full bg-white dark:bg-slate-800 rounded-2xl p-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-100 dark:border-slate-700 text-left">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                    style={{ backgroundColor: p.color + '20' }}>
                    {p.flag}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{p.name}</p>
                    <p className="text-xs text-slate-400 truncate">{p.countries}</p>
                  </div>
                  <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* Bank providers */}
          {methodType === 'bank' && (
            <div className="space-y-2">
              {BANK_PROVIDERS.map(p => (
                <button key={p.id} onClick={() => { setMethod(p); setStep('amount'); }}
                  className="w-full bg-white dark:bg-slate-800 rounded-2xl p-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-100 dark:border-slate-700 text-left">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl flex-shrink-0">
                    {p.flag}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{p.name}</p>
                    <p className="text-xs text-slate-400 truncate">{p.desc}</p>
                  </div>
                  <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />
                </button>
              ))}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 text-sm text-blue-700 dark:text-blue-400">
                <p className="font-semibold mb-1">Bank transfers coming soon</p>
                <p className="text-xs opacity-80">We are integrating with banks across Africa. Select one to be notified when available.</p>
              </div>
            </div>
          )}
        </div>
        <BottomNav />
      </div>
    );
  }

  // ── Step: enter amount ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-24">
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 px-5 py-4 flex items-center gap-3">
        <button onClick={() => setStep('method')} className="p-2 -ml-2 rounded-full hover:bg-slate-100">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xl">{method?.flag}</span>
          <h1 className="text-lg font-semibold">Deposit via {method?.name}</h1>
        </div>
      </div>

      <div className="px-5 max-w-md mx-auto mt-6 space-y-5">
        {/* Amount input */}
        <div className="card space-y-3">
          <label className="text-sm font-medium text-slate-500">Amount</label>
          <div className="flex items-center gap-3 border-2 border-primary rounded-2xl px-4 min-h-[64px] bg-white dark:bg-slate-800">
            <span className="text-slate-400 font-medium text-sm">Local currency</span>
            <input type="number" inputMode="numeric" placeholder="0"
              value={amount} onChange={e => setAmount(e.target.value)}
              className="flex-1 bg-transparent text-3xl font-bold outline-none py-3 text-right"
              min="500" autoFocus />
          </div>
          {/* Quick amounts */}
          <div className="grid grid-cols-3 gap-2">
            {[5000, 10000, 20000, 50000, 100000, 500000].map(p => (
              <button key={p} onClick={() => setAmount(String(p))}
                className={`text-sm font-semibold py-2 px-3 rounded-xl min-h-[40px] transition-colors ${
                  amountNum === p ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'
                }`}>
                {p >= 1000 ? `${p/1000}K` : p}
              </button>
            ))}
          </div>
        </div>

        {/* Fee breakdown */}
        {amountNum >= 500 && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Transaction Breakdown</p>
            </div>
            <div className="bg-white dark:bg-slate-900 px-4 py-3 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">You pay ({method?.name})</span>
                <span className="font-semibold">{amountNum.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Exchange rate</span>
                <span>1 USD ≈ {rate.toLocaleString()} local</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Converted to USD</span>
                <span className="font-semibold">{formatUsdc(amountUsdc)}</span>
              </div>
              <div className="flex justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">OlomiPay fee</span>
                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 rounded-full font-medium">1%</span>
                </div>
                <span className="text-amber-600">− {formatUsdc(fee)}</span>
              </div>
              <div className="border-t border-slate-100 dark:border-slate-800" />
              <div className="flex justify-between font-bold">
                <span>You receive</span>
                <span className="text-green-600">{formatUsdc(netUsdc)} USD</span>
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-400 text-center">OlomiPay charges 1% per deposit. No hidden fees.</p>
            </div>
          </div>
        )}

        <button onClick={handleDeposit} disabled={amountNum < 500 || loading}
          className="btn-primary w-full text-base">
          {loading ? 'Sending prompt...' : `Deposit ${amountNum > 0 ? amountNum.toLocaleString() : ''} via ${method?.name ?? ''}`}
        </button>
      </div>
      <BottomNav />
    </div>
  );
}
