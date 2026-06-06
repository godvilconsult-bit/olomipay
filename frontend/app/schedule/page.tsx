'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Pause, Trash2, Calendar } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import { formatUsdc, timeAgo } from '../../lib/utils';

async function scheduleApi(path: string, method = 'GET', body?: any) {
  const token = (localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt'));
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/schedule${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const FREQ_LABELS: Record<string, string> = {
  DAILY: 'Daily', WEEKLY: 'Weekly', BIWEEKLY: 'Every 2 weeks', MONTHLY: 'Monthly',
};

export default function SchedulePage() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [form, setForm] = useState({
    toPhone: '', toName: '', amount: '', asset: 'USDC',
    frequency: 'MONTHLY', startDate: new Date().toISOString().slice(0, 16),
    memo: '',
  });

  useEffect(() => {
    scheduleApi('/list').then(r => { if (r.success) setSchedules(r.data.schedules); setLoading(false); });
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const r = await scheduleApi('/create', 'POST', {
      toPhone:   form.toPhone || undefined,
      toName:    form.toName || undefined,
      amount:    parseFloat(form.amount),
      asset:     form.asset,
      frequency: form.frequency,
      startDate: new Date(form.startDate).toISOString(),
      memo:      form.memo || undefined,
    });
    if (r.success) {
      toast.success('Scheduled payment created!');
      setSchedules(s => [r.data.schedule, ...s]);
      setShowForm(false);
    } else toast.error(r.error ?? 'Failed');
  }

  async function handleCancel(id: string) {
    const r = await scheduleApi(`/${id}`, 'DELETE');
    if (r.success) setSchedules(s => s.filter(x => x.id !== id));
    else toast.error(r.error ?? 'Failed');
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold flex-1">Scheduled Payments</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 text-sm text-primary font-medium min-h-[44px] px-2">
          <Plus size={16} /> New
        </button>
      </div>

      <div className="px-5 max-w-md mx-auto mt-4 space-y-4">
        {/* Create form */}
        {showForm && (
          <form onSubmit={handleCreate} className="card space-y-3">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200">New Scheduled Payment</h3>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Recipient Phone (+255...)</label>
              <input type="tel" placeholder="+255712345678" value={form.toPhone}
                onChange={e => setForm(f => ({ ...f, toPhone: e.target.value }))}
                className="input" required />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Name (optional)</label>
              <input type="text" placeholder="e.g. Mama" value={form.toName}
                onChange={e => setForm(f => ({ ...f, toName: e.target.value }))}
                className="input" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-slate-500 block mb-1">Amount</label>
                <input type="number" placeholder="50" value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="input" required />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Asset</label>
                <select value={form.asset} onChange={e => setForm(f => ({ ...f, asset: e.target.value }))} className="input w-24">
                  <option value="USDC">USD</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Frequency</label>
              <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))} className="input">
                {Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">First payment date</label>
              <input type="datetime-local" value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="input" required />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Note (optional)</label>
              <input type="text" placeholder="e.g. Monthly allowance" value={form.memo}
                onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                className="input" />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1">Create</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </form>
        )}

        {/* Schedule list */}
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>
        ) : schedules.length === 0 && !showForm ? (
          <div className="text-center py-16">
            <Calendar size={40} className="text-slate-300 mx-auto mb-3" />
            <p className="font-medium text-slate-400">No scheduled payments</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">Set up automatic transfers to family or for bills</p>
            <button onClick={() => setShowForm(true)} className="btn-primary px-6">
              Create first schedule
            </button>
          </div>
        ) : (
          schedules.map(s => (
            <div key={s.id} className="card">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Calendar size={18} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{s.toName ?? s.toPhone ?? s.toAddress?.slice(0,8)+'...'}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {formatUsdc(s.amount)} · {FREQ_LABELS[s.frequency]}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Next: {new Date(s.nextRunAt).toLocaleDateString('en-TZ')}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${s.isActive ? 'bg-success/10 text-success' : 'bg-slate-100 text-slate-400'}`}>
                    {s.isActive ? 'Active' : 'Paused'}
                  </span>
                  <button onClick={() => handleCancel(s.id)}
                    className="p-2 rounded-xl hover:bg-red-50 text-slate-400 hover:text-danger min-h-[36px] min-w-[36px] flex items-center justify-center">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Executed {s.executionCount} time{s.executionCount !== 1 ? 's' : ''}
                {s.lastRunAt ? ` · Last ran ${timeAgo(s.lastRunAt)}` : ''}
              </p>
            </div>
          ))
        )}
      </div>
      <BottomNav />
    </div>
  );
}
