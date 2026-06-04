'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Upload, Plus, Trash2, Users, FileText, CheckCircle2,
  XCircle, Clock, Download, ChevronRight, Loader2, DollarSign,
} from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import PinInput from '../../components/PinInput';
import { formatUsdc } from '../../lib/utils';

const API = process.env.NEXT_PUBLIC_API_URL;
function getToken() {
  return sessionStorage.getItem('olomipay_at') || sessionStorage.getItem('olomipay_rt') || '';
}
async function payrollApi(path: string, method = 'GET', body?: any) {
  const r = await fetch(`${API}/api/payroll${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

type Recipient = {
  name:       string;
  phone?:     string;
  address?:   string;
  amountUsdc: number;
  department?: string;
  reference?: string;
};

type Step = 'build' | 'preview' | 'pin' | 'result';

export default function PayrollPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step,       setStep]       = useState<Step>('build');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [preview,    setPreview]    = useState<any>(null);
  const [pin,        setPin]        = useState('');
  const [result,     setResult]     = useState<any>(null);
  const [loading,    setLoading]    = useState(false);
  const [history,    setHistory]    = useState<any[]>([]);
  const [tab,        setTab]        = useState<'new'|'history'>('new');

  // Manual entry form
  const [mName,   setMName]   = useState('');
  const [mPhone,  setMPhone]  = useState('');
  const [mAmount, setMAmount] = useState('');
  const [mDept,   setMDept]   = useState('');

  useEffect(() => { loadHistory(); }, []);

  async function loadHistory() {
    const r = await payrollApi('/history');
    if (r.success) setHistory(r.data.runs ?? []);
  }

  function addRecipient() {
    if (!mName.trim() || !mPhone.trim() || !(parseFloat(mAmount) > 0)) {
      toast.error('Enter name, phone and a valid amount');
      return;
    }
    let phone = mPhone.trim().replace(/\s/g, '');
    if (phone.startsWith('0')) phone = '+255' + phone.slice(1);
    if (!phone.startsWith('+')) phone = '+255' + phone;

    setRecipients(prev => [...prev, {
      name:       mName.trim(),
      phone,
      amountUsdc: parseFloat(mAmount),
      department: mDept.trim() || undefined,
    }]);
    setMName(''); setMPhone(''); setMAmount(''); setMDept('');
    toast.success('Recipient added');
  }

  function removeRecipient(i: number) {
    setRecipients(prev => prev.filter((_, idx) => idx !== i));
  }

  // Parse CSV: name,phone,amount,department
  function handleCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text  = reader.result as string;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const parsed: Recipient[] = [];
        // Detect header
        const startIdx = /name/i.test(lines[0]) && /amount/i.test(lines[0]) ? 1 : 0;
        for (let i = startIdx; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          if (cols.length < 3) continue;
          const [name, phoneRaw, amt, dept] = cols;
          const amount = parseFloat(amt);
          if (!name || !(amount > 0)) continue;
          let phone = phoneRaw.replace(/\s/g, '');
          if (phone.startsWith('0')) phone = '+255' + phone.slice(1);
          if (phone && !phone.startsWith('+')) phone = '+255' + phone;
          parsed.push({ name, phone: phone || undefined, amountUsdc: amount, department: dept || undefined });
        }
        if (parsed.length === 0) { toast.error('No valid rows found in CSV'); return; }
        setRecipients(prev => [...prev, ...parsed]);
        toast.success(`${parsed.length} recipients imported`);
      } catch {
        toast.error('Could not parse CSV');
      }
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function buildPreview() {
    if (recipients.length === 0) { toast.error('Add at least one recipient'); return; }
    setLoading(true);
    try {
      const r = await payrollApi('/upload', 'POST', { recipients });
      if (!r.success) { toast.error(r.error ?? 'Upload failed'); return; }
      setPreview(r.data);
      setStep('preview');
    } finally { setLoading(false); }
  }

  async function execute() {
    if (pin.length < 6) { toast.error('Enter your 6-digit PIN'); return; }
    setLoading(true);
    try {
      const r = await payrollApi('/execute', 'POST', { batchId: preview.batchId, pin });
      if (!r.success) { toast.error(r.error ?? 'Execution failed'); setPin(''); return; }
      setResult(r.data);
      setStep('result');
      loadHistory();
    } finally { setLoading(false); }
  }

  function reset() {
    setStep('build'); setRecipients([]); setPreview(null);
    setPin(''); setResult(null); setTab('new');
  }

  const total = recipients.reduce((s, r) => s + r.amountUsdc, 0);
  const fee   = total * 0.005;

  // ── Result screen ────────────────────────────────────────────────────────────
  if (step === 'result' && result) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 pb-24">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={40} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-bold">Payroll Sent!</h2>
          <p className="text-slate-500">{result.message}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-4">
              <p className="text-2xl font-bold text-green-600">{result.successCount}</p>
              <p className="text-xs text-slate-500">Successful</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4">
              <p className="text-2xl font-bold text-red-600">{result.failedCount}</p>
              <p className="text-xs text-slate-500">Failed</p>
            </div>
          </div>
          <button onClick={reset} className="btn-primary w-full">Done</button>
        </div>
        <BottomNav />
      </div>
    );
  }

  // ── PIN screen ───────────────────────────────────────────────────────────────
  if (step === 'pin' && preview) {
    return (
      <div className="min-h-screen pb-24">
        <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 px-5 py-4 flex items-center gap-3">
          <button onClick={() => setStep('preview')} className="p-2 -ml-2 rounded-full hover:bg-slate-100">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold">Confirm Payroll</h1>
        </div>
        <div className="max-w-md mx-auto px-5 pt-10 flex flex-col items-center gap-6 text-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 w-full">
            <p className="text-sm text-slate-500">Disbursing to {preview.count} recipients</p>
            <p className="text-3xl font-bold mt-1">{formatUsdc(preview.netTotal)}</p>
            <p className="text-xs text-slate-400 mt-1">incl. {formatUsdc(preview.fee)} batch fee (0.5%)</p>
          </div>
          <p className="text-slate-500 text-sm">Enter your PIN to authorise this payroll</p>
          <PinInput value={pin} onChange={setPin} autoFocus />
          <button onClick={execute} disabled={pin.length < 6 || loading}
            className="btn-primary w-full">
            {loading ? <Loader2 size={18} className="animate-spin" /> : `Pay ${formatUsdc(preview.netTotal)}`}
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  // ── Preview screen ───────────────────────────────────────────────────────────
  if (step === 'preview' && preview) {
    return (
      <div className="min-h-screen pb-28">
        <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 px-5 py-4 flex items-center gap-3">
          <button onClick={() => setStep('build')} className="p-2 -ml-2 rounded-full hover:bg-slate-100">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold">Review Payroll</h1>
        </div>

        <div className="max-w-md mx-auto px-4 pt-5 space-y-4">
          {/* Summary */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payroll Summary</p>
            </div>
            <div className="bg-white dark:bg-slate-900 px-4 py-3 space-y-2.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Recipients</span><span className="font-semibold">{preview.count}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Total disbursed</span><span className="font-semibold">{formatUsdc(preview.total)}</span></div>
              <div className="flex justify-between">
                <div className="flex items-center gap-1.5"><span className="text-slate-500">Batch fee</span><span className="text-xs bg-amber-100 text-amber-700 px-1.5 rounded-full font-medium">0.5%</span></div>
                <span className="text-amber-600">+ {formatUsdc(preview.fee)}</span>
              </div>
              <div className="border-t border-slate-100 dark:border-slate-800" />
              <div className="flex justify-between font-bold"><span>Total to pay</span><span className="text-primary">{formatUsdc(preview.netTotal)}</span></div>
            </div>
          </div>

          {/* Recipients list */}
          <div className="space-y-2">
            {preview.recipients.map((r: any) => (
              <div key={r.id} className="bg-white dark:bg-slate-800 rounded-2xl p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                  {r.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{r.name}</p>
                  <p className="text-xs text-slate-400">{r.phone ?? r.address?.slice(0, 10) + '...'}{r.department ? ` · ${r.department}` : ''}</p>
                </div>
                <p className="font-bold text-sm flex-shrink-0">{formatUsdc(r.amountUsdc)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="fixed bottom-16 inset-x-0 px-4 py-3 bg-white dark:bg-slate-900 border-t border-slate-100 md:ml-56 lg:ml-64">
          <div className="max-w-md mx-auto">
            <button onClick={() => setStep('pin')} className="btn-primary w-full">
              Continue to pay {formatUsdc(preview.netTotal)}
            </button>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  // ── Build screen (default) ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-28">
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 px-5 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-slate-100">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold flex-1">Payroll</h1>
        <Users size={20} className="text-primary" />
      </div>

      {/* Tabs */}
      <div className="flex bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
        {(['new', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-semibold capitalize border-b-2 transition-colors ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-slate-400'
            }`}>
            {t === 'new' ? 'New Payroll' : 'History'}
          </button>
        ))}
      </div>

      <div className="max-w-md mx-auto px-4 pt-5 space-y-4">
        {tab === 'new' && (
          <>
            {/* Import / manual */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">Add Recipients</p>
                <button onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-primary font-semibold bg-primary/10 px-3 py-1.5 rounded-xl">
                  <Upload size={13} /> Import CSV
                </button>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsv} />
              </div>
              <p className="text-xs text-slate-400">CSV format: name, phone, amount, department</p>

              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Full name" value={mName} onChange={e => setMName(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-700 rounded-xl px-3 py-2.5 text-sm outline-none" />
                <input placeholder="Phone +255..." value={mPhone} onChange={e => setMPhone(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-700 rounded-xl px-3 py-2.5 text-sm outline-none" />
                <input placeholder="Amount USD" type="number" value={mAmount} onChange={e => setMAmount(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-700 rounded-xl px-3 py-2.5 text-sm outline-none" />
                <input placeholder="Department (opt)" value={mDept} onChange={e => setMDept(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-700 rounded-xl px-3 py-2.5 text-sm outline-none" />
              </div>
              <button onClick={addRecipient}
                className="w-full flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 py-2.5 rounded-xl text-sm font-semibold">
                <Plus size={15} /> Add recipient
              </button>
            </div>

            {/* Recipients list */}
            {recipients.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase">{recipients.length} recipients · {formatUsdc(total)}</p>
                  <button onClick={() => setRecipients([])} className="text-xs text-red-500">Clear all</button>
                </div>
                {recipients.map((r, i) => (
                  <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs flex-shrink-0">
                      {r.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{r.name}</p>
                      <p className="text-xs text-slate-400 truncate">{r.phone}{r.department ? ` · ${r.department}` : ''}</p>
                    </div>
                    <p className="font-bold text-sm">{formatUsdc(r.amountUsdc)}</p>
                    <button onClick={() => removeRecipient(i)} className="p-1.5 text-slate-300 hover:text-red-500">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {recipients.length === 0 && (
              <div className="text-center py-10 text-slate-400">
                <Users size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No recipients yet</p>
                <p className="text-xs mt-1">Add manually or import a CSV file</p>
              </div>
            )}
          </>
        )}

        {tab === 'history' && (
          <div className="space-y-2">
            {history.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <FileText size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No payroll history yet</p>
              </div>
            ) : history.map(run => (
              <div key={run.id} className="bg-white dark:bg-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    run.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' :
                    run.status === 'PENDING'   ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>{run.status}</span>
                  <p className="font-bold text-sm">{formatUsdc(run.totalAmount)}</p>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{run._count?.recipients ?? run.recipientCount} recipients</span>
                  <span>{new Date(run.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky CTA */}
      {tab === 'new' && recipients.length > 0 && (
        <div className="fixed bottom-16 inset-x-0 px-4 py-3 bg-white dark:bg-slate-900 border-t border-slate-100 md:ml-56 lg:ml-64">
          <div className="max-w-md mx-auto flex items-center gap-3">
            <div className="flex-1">
              <p className="text-xs text-slate-400">Total incl. 0.5% fee</p>
              <p className="font-bold">{formatUsdc(total + fee)}</p>
            </div>
            <button onClick={buildPreview} disabled={loading}
              className="btn-primary flex-1 flex items-center justify-center gap-2">
              {loading ? <Loader2 size={18} className="animate-spin" /> : <>Review <ChevronRight size={16} /></>}
            </button>
          </div>
        </div>
      )}
      <BottomNav />
    </div>
  );
}
