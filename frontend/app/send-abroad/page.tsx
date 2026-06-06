'use client';

/* Cross-border send — pick a country, enter the recipient's mobile-money
   number, and the money lands in their wallet in local currency. */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Globe, CheckCircle2 } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import PinInput from '../../components/PinInput';
import { formatUsdc } from '../../lib/utils';

async function remitApi(path: string, method = 'GET', body?: any) {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt')) : null;
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/remit${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

type Country = { country: string; currency: string; name: string; flag: string; dial: string; channels: any[] };
type Step = 'country' | 'details' | 'pin' | 'success';

export default function SendAbroadPage() {
  const router = useRouter();
  const [countries, setCountries] = useState<Country[]>([]);
  const [sandbox, setSandbox] = useState(false);
  const [step, setStep] = useState<Step>('country');
  const [sel, setSel] = useState<Country | null>(null);
  const [channelId, setChannelId] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [quote, setQuote] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    remitApi('/countries', 'GET').then(r => {
      if (r.success) { setCountries(r.data.countries); setSandbox(r.data.isSandbox); }
    });
  }, []);

  const amt = parseFloat(amount) || 0;

  // Debounced quote
  useEffect(() => {
    if (!sel || amt <= 0) { setQuote(null); return; }
    const t = setTimeout(async () => {
      const r = await remitApi('/quote', 'POST', { amountUsdc: amt, currency: sel.currency, network: channelId });
      if (r.success) setQuote(r.data);
    }, 400);
    return () => clearTimeout(t);
  }, [amt, sel, channelId]);

  async function send() {
    if (!sel) return;
    setBusy(true);
    const r = await remitApi('/send', 'POST', {
      amountUsdc: amt, currency: sel.currency, channelId,
      recipientPhone: phone, recipientName: name || undefined, pin,
    });
    setBusy(false); setPin('');
    if (r.success) { setResult(r.data); setStep('success'); }
    else { toast.error(r.error ?? 'Failed'); setStep('details'); }
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
        <button onClick={() => step === 'country' ? router.back() : setStep('country')} className="p-2 -ml-2 rounded-full hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">Send abroad</h1>
        <Globe size={18} className="ml-auto text-primary" />
      </div>

      <div className="px-5 max-w-md mx-auto mt-4 space-y-3">
        {sandbox && step !== 'success' && (
          <div className="card bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-xs">
            Demo mode — cross-border payouts go live once Yellow Card production is approved.
          </div>
        )}

        {step === 'country' && (
          <>
            <p className="text-sm text-slate-500">Choose where the money is going</p>
            {countries.length === 0 && <div className="card"><div className="skeleton h-12 w-full" /></div>}
            {countries.map(c => (
              <button key={c.country} onClick={() => { setSel(c); setChannelId(c.channels[0]?.id ?? ''); setStep('details'); }}
                className="card w-full flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-white/5">
                <span className="text-2xl">{c.flag}</span>
                <div className="flex-1">
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.channels.length} payout option{c.channels.length !== 1 ? 's' : ''} · {c.currency}</p>
                </div>
                <span className="text-slate-400">›</span>
              </button>
            ))}
          </>
        )}

        {step === 'details' && sel && (
          <div className="space-y-4">
            <div className="card flex items-center gap-3">
              <span className="text-2xl">{sel.flag}</span>
              <div><p className="font-semibold">{sel.name}</p><p className="text-xs text-slate-500">Paid out in {sel.currency}</p></div>
            </div>
            {sel.channels.length > 1 && (
              <div>
                <label className="text-xs text-slate-500 block mb-1">Payout network</label>
                <select value={channelId} onChange={e => setChannelId(e.target.value)} className="input">
                  {sel.channels.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs text-slate-500 block mb-1">Recipient's mobile number</label>
              <div className="flex gap-2">
                <span className="input w-20 flex items-center justify-center text-slate-500">+{sel.dial}</span>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="7XX XXX XXX" className="input flex-1" />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Recipient's name (optional)</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mama" className="input" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">You send (USD)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="input text-2xl font-bold" />
            </div>
            {quote && amt > 0 && (
              <div className="card bg-emerald-50 dark:bg-emerald-900/20 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Recipient gets</span><span className="font-bold text-emerald-700 dark:text-emerald-400">{quote.localPayout.toLocaleString()} {quote.currency}</span></div>
                <div className="flex justify-between text-xs text-slate-500"><span>Fee</span><span>{formatUsdc(quote.feeUsdc)}</span></div>
                <div className="flex justify-between text-xs text-slate-500"><span>Arrives in</span><span>~{quote.estimatedMins || 3} min</span></div>
              </div>
            )}
            <button onClick={() => setStep('pin')} disabled={amt <= 0 || phone.length < 6 || !channelId} className="btn-primary w-full">Continue</button>
          </div>
        )}

        {step === 'pin' && sel && (
          <div className="flex flex-col items-center gap-5 mt-6">
            <div className="card w-full text-center">
              <p className="text-sm text-slate-500">Sending to {name || phone}</p>
              <p className="text-3xl font-bold text-primary my-1">{formatUsdc(amt)}</p>
              {quote && <p className="text-sm text-slate-500">{quote.localPayout.toLocaleString()} {quote.currency}</p>}
            </div>
            <p className="text-sm text-slate-500">Enter PIN to confirm</p>
            <PinInput value={pin} onChange={setPin} autoFocus />
            <button onClick={send} disabled={pin.length < 6 || busy} className="btn-primary w-full">{busy ? 'Sending…' : 'Send money'}</button>
          </div>
        )}

        {step === 'success' && result && (
          <div className="flex flex-col items-center gap-5 mt-8 text-center">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center"><CheckCircle2 size={40} className="text-emerald-600" /></div>
            <h2 className="text-2xl font-bold">{result.message}</h2>
            <p className="text-slate-500 text-sm">{result.recipient} will receive {result.localPayout?.toLocaleString()} {result.currency}.</p>
            <button onClick={() => { setStep('country'); setAmount(''); setPhone(''); setName(''); setQuote(null); setResult(null); }} className="btn-primary w-full">Done</button>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
