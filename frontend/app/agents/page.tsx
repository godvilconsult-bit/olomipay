'use client';

/* Agent / cash network — turn cash into balance and back through local agents.
   One screen, two roles: customers find agents + cash out; agents cash people in. */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Store, MapPin, Banknote, X } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import PinInput from '../../components/PinInput';
import { formatUsdc } from '../../lib/utils';

async function agentApi(path: string, method = 'GET', body?: any) {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt')) : null;
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agents${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export default function AgentsPage() {
  const router = useRouter();
  const [agent, setAgent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | 'apply' | 'cashin' | 'cashout'>(null);

  const load = () => agentApi('/me').then(r => { if (r.success) setAgent(r.data.agent); }).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const isActiveAgent = agent?.status === 'active';

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">Cash agents</h1>
      </div>

      <div className="px-5 max-w-md mx-auto mt-4 space-y-3">
        {loading ? <div className="card"><div className="skeleton h-16 w-full" /></div> : (
          <>
            {/* Customer actions */}
            <button onClick={() => setModal('cashout')} className="card w-full flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-white/5">
              <span className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center"><Banknote size={20} className="text-emerald-600" /></span>
              <div className="flex-1"><p className="font-semibold">Get cash from an agent</p><p className="text-xs text-slate-500">Withdraw physical cash near you</p></div>
              <span className="text-slate-400">›</span>
            </button>
            <button onClick={() => router.push('/agents/find')} className="card w-full flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-white/5">
              <span className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"><MapPin size={20} className="text-blue-600" /></span>
              <div className="flex-1"><p className="font-semibold">Find a cash point</p><p className="text-xs text-slate-500">Agents near you</p></div>
              <span className="text-slate-400">›</span>
            </button>

            {/* Agent area */}
            {isActiveAgent ? (
              <AgentDashboard agent={agent} onCashIn={() => setModal('cashin')} />
            ) : agent?.status === 'pending' ? (
              <div className="card bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <p className="font-semibold text-amber-700 dark:text-amber-400">Agent application under review ⏳</p>
                <p className="text-xs text-amber-600/80 mt-1">We'll notify you once "{agent.businessName}" is approved.</p>
              </div>
            ) : (
              <button onClick={() => setModal('apply')} className="card w-full flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-white/5">
                <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Store size={20} className="text-primary" /></span>
                <div className="flex-1"><p className="font-semibold">Become an agent</p><p className="text-xs text-slate-500">Earn commission serving your community</p></div>
                <span className="text-slate-400">›</span>
              </button>
            )}
          </>
        )}
      </div>

      {modal === 'apply'   && <ApplyModal onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal === 'cashin'  && <CashInModal onClose={() => setModal(null)} onDone={() => setModal(null)} />}
      {modal === 'cashout' && <CashOutModal onClose={() => setModal(null)} onDone={() => setModal(null)} />}

      <BottomNav />
    </div>
  );
}

function AgentDashboard({ agent, onCashIn }: { agent: any; onCashIn: () => void }) {
  const [txs, setTxs] = useState<any[]>([]);
  useEffect(() => { agentApi('/transactions').then(r => r.success && setTxs(r.data.transactions)); }, []);
  return (
    <div className="space-y-3 pt-2">
      <div className="card bg-gradient-to-br from-[#1a3a6b] to-[#1a56db] text-white">
        <div className="flex justify-between items-start">
          <div><p className="text-xs text-white/70">Agent · {agent.code}</p><p className="font-bold text-lg">{agent.businessName}</p></div>
          <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Active</span>
        </div>
        <p className="text-xs text-white/70 mt-3">Commission earned</p>
        <p className="text-2xl font-bold">{formatUsdc(agent.commissionEarned)}</p>
      </div>
      <button onClick={onCashIn} className="btn-primary w-full">Cash a customer in</button>
      {txs.length > 0 && (
        <div className="card">
          <p className="font-semibold text-sm mb-2">Recent</p>
          {txs.slice(0, 8).map(t => (
            <div key={t.id} className="flex justify-between py-1.5 text-sm border-b border-slate-100 dark:border-slate-800 last:border-0">
              <span className={t.type === 'CASH_IN' ? 'text-emerald-600' : 'text-blue-600'}>{t.type === 'CASH_IN' ? 'Cash-in' : 'Cash-out'}</span>
              <span className="font-semibold">{formatUsdc(t.amountUsdc)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ApplyModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [businessName, setB] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!businessName || !city || !phone) { toast.error('Fill all fields'); return; }
    setBusy(true);
    const r = await agentApi('/apply', 'POST', { businessName, city, phone });
    setBusy(false);
    if (r.success) { toast.success('Application submitted'); onDone(); } else toast.error(r.error ?? 'Failed');
  }
  return (
    <Sheet title="Become an agent" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Earn commission by helping people turn cash into balance and back.</p>
        <input value={businessName} onChange={e => setB(e.target.value)} placeholder="Business / shop name" className="input" />
        <input value={city} onChange={e => setCity(e.target.value)} placeholder="City / area" className="input" />
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Contact phone" className="input" />
        <button onClick={submit} disabled={busy} className="btn-primary w-full">{busy ? 'Submitting…' : 'Apply'}</button>
      </div>
    </Sheet>
  );
}

function CashInModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [customerPhone, setP] = useState('');
  const [amount, setA] = useState('');
  const [pin, setPin] = useState('');
  const [step, setStep] = useState<'form' | 'pin'>('form');
  const [busy, setBusy] = useState(false);
  const amt = parseFloat(amount) || 0;
  async function submit() {
    setBusy(true);
    const r = await agentApi('/cash-in', 'POST', { customerPhone, amountUsdc: amt, pin });
    setBusy(false); setPin('');
    if (r.success) { toast.success('Cash-in complete'); onDone(); } else { toast.error(r.error ?? 'Failed'); setStep('form'); }
  }
  return (
    <Sheet title="Cash in a customer" onClose={onClose}>
      {step === 'form' ? (
        <div className="space-y-3">
          <input value={customerPhone} onChange={e => setP(e.target.value)} placeholder="Customer's phone number" className="input" />
          <input type="number" value={amount} onChange={e => setA(e.target.value)} placeholder="Amount (USD) they handed you" className="input text-xl font-bold" />
          <p className="text-xs text-slate-500">You give them digital balance; collect the cash equivalent.</p>
          <button onClick={() => setStep('pin')} disabled={amt <= 0 || customerPhone.length < 6} className="btn-primary w-full">Continue</button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-slate-500">Sending {formatUsdc(amt)} to {customerPhone}</p>
          <PinInput value={pin} onChange={setPin} autoFocus />
          <button onClick={submit} disabled={pin.length < 6 || busy} className="btn-primary w-full">{busy ? 'Processing…' : 'Confirm cash-in'}</button>
        </div>
      )}
    </Sheet>
  );
}

function CashOutModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [agentCode, setCode] = useState('');
  const [amount, setA] = useState('');
  const [req, setReq] = useState<any>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(0); // seconds until code expiry
  const amt = parseFloat(amount) || 0;

  // Countdown to expiry; clears the request when it hits zero.
  useEffect(() => {
    if (!req?.expiresAt) return;
    const tick = () => {
      const s = Math.max(0, Math.round((new Date(req.expiresAt).getTime() - Date.now()) / 1000));
      setRemaining(s);
      if (s === 0) { setReq(null); toast.error('Code expired — please start again'); }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [req]);

  const mmss = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;

  async function request() {
    setBusy(true);
    const r = await agentApi('/cash-out/request', 'POST', { agentCode, amountUsdc: amt });
    setBusy(false);
    if (r.success) setReq(r.data); else toast.error(r.error ?? 'Failed');
  }
  async function confirm() {
    setBusy(true);
    const r = await agentApi('/cash-out/confirm', 'POST', { transactionId: req.transactionId, pin });
    setBusy(false); setPin('');
    if (r.success) { toast.success('Confirmed — collect your cash'); onDone(); }
    else { toast.error(r.error ?? 'Failed'); setReq(null); }
  }
  return (
    <Sheet title="Get cash from an agent" onClose={onClose}>
      {!req ? (
        <div className="space-y-3">
          <input value={agentCode} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Agent code (e.g. AGT-TZ-4821)" className="input" />
          <input type="number" value={amount} onChange={e => setA(e.target.value)} placeholder="Amount (USD)" className="input text-xl font-bold" />
          <button onClick={request} disabled={amt <= 0 || agentCode.length < 3 || busy} className="btn-primary w-full">{busy ? 'Checking…' : 'Continue'}</button>
        </div>
      ) : (
        <div className="space-y-4 text-center">
          <div className="card bg-emerald-50 dark:bg-emerald-900/20">
            <p className="text-xs text-slate-500">Show this code to {req.agent}</p>
            <p className="text-3xl font-bold tracking-widest text-emerald-700 dark:text-emerald-400 my-1">{req.code}</p>
            <p className="text-sm text-slate-500">You'll get {req.local?.toLocaleString()} {req.currency} ({formatUsdc(req.amountUsdc)})</p>
            <p className={`text-xs mt-1 font-semibold ${remaining <= 60 ? 'text-rose-500' : 'text-slate-400'}`}>Expires in {mmss}</p>
          </div>
          <p className="text-sm text-slate-500">Enter PIN to release the money once the agent is ready</p>
          <PinInput value={pin} onChange={setPin} autoFocus />
          <button onClick={confirm} disabled={pin.length < 6 || busy} className="btn-primary w-full">{busy ? 'Processing…' : 'Confirm & release'}</button>
        </div>
      )}
    </Sheet>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-3xl p-5 pb-8 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/5"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
