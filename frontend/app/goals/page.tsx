'use client';

/* Goal-based savings — save with purpose ("School fees", "Rent"), track
   progress, and set an auto-save reminder. Money lives in the same Savings
   vault and earns the same return. No crypto wording. */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Plus, X, Target, Sparkles, Trash2 } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import PageHeader from '../../components/PageHeader';
import PinInput from '../../components/PinInput';
import { formatUsdc } from '../../lib/utils';

async function goalsApi(path: string, method = 'GET', body?: any) {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt')) : null;
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/savings${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const EMOJIS = ['🎯', '🏠', '🎓', '🚗', '💍', '🏥', '✈️', '📱', '👶', '🛒', '💼', '🌱'];

type Goal = {
  id: string; name: string; emoji: string; targetAmount: number; savedAmount: number;
  targetDate?: string | null; autoSaveAmount: number; autoSaveFreq: string; status: string;
};

export default function GoalsPage() {
  const router = useRouter();
  const [goals, setGoals]     = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [active, setActive]   = useState<Goal | null>(null); // contribute/withdraw modal

  const load = () => goalsApi('/goals').then(r => { if (r.success) setGoals(r.data.goals); }).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen pb-24">
      <PageHeader eyebrow="Grow" title="Savings Goals" right={
        <button onClick={() => setShowNew(true)} className="flex items-center gap-1 text-sm font-semibold text-primary pr-1">
          <Plus size={18} /> New
        </button>
      } />

      <div className="px-5 max-w-md mx-auto mt-4 space-y-3">
        {loading ? (
          <div className="card"><div className="skeleton h-16 w-full" /></div>
        ) : goals.length === 0 ? (
          <div className="card text-center py-10">
            <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-3">
              <Target size={28} className="text-primary" />
            </div>
            <h3 className="font-semibold">Save with a purpose</h3>
            <p className="text-sm text-slate-500 mt-1 mb-4">Create a goal like “School fees” or “New phone” and watch it grow.</p>
            <button onClick={() => setShowNew(true)} className="btn-primary">Create your first goal</button>
          </div>
        ) : goals.map(g => {
          const pct = Math.min(100, Math.round((g.savedAmount / g.targetAmount) * 100));
          const done = g.savedAmount >= g.targetAmount;
          return (
            <div key={g.id} className="card" onClick={() => setActive(g)} role="button">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{g.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{g.name}</p>
                  <p className="text-xs text-slate-500">{formatUsdc(g.savedAmount)} of {formatUsdc(g.targetAmount)}</p>
                </div>
                {done
                  ? <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-1 rounded-full">Reached 🎉</span>
                  : <span className="text-sm font-bold text-primary">{pct}%</span>}
              </div>
              <div className="mt-2.5 h-2.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-grad-brand'}`} style={{ width: `${pct}%` }} />
              </div>
              {g.autoSaveFreq !== 'none' && g.autoSaveAmount > 0 && (
                <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                  <Sparkles size={11} /> Auto-save reminder: {formatUsdc(g.autoSaveAmount)} {g.autoSaveFreq}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {showNew && <NewGoalModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
      {active && <GoalModal goal={active} onClose={() => setActive(null)} onChanged={() => { setActive(null); load(); }} />}

      <BottomNav />
    </div>
  );
}

// ── New goal ──────────────────────────────────────────────────────────────────
function NewGoalModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName]     = useState('');
  const [emoji, setEmoji]   = useState('🎯');
  const [target, setTarget] = useState('');
  const [autoAmt, setAutoAmt] = useState('');
  const [freq, setFreq]     = useState<'none' | 'weekly' | 'monthly'>('none');
  const [busy, setBusy]     = useState(false);

  async function create() {
    const targetAmount = parseFloat(target) || 0;
    if (!name.trim() || targetAmount <= 0) { toast.error('Add a name and target amount'); return; }
    setBusy(true);
    const r = await goalsApi('/goals', 'POST', {
      name: name.trim(), emoji, targetAmount,
      autoSaveAmount: parseFloat(autoAmt) || 0, autoSaveFreq: freq,
    });
    setBusy(false);
    if (r.success) { toast.success('Goal created 🎯'); onCreated(); }
    else toast.error(r.error ?? 'Failed');
  }

  return (
    <Sheet title="New goal" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs text-slate-500 block mb-1.5">Choose an icon</label>
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map(e => (
              <button key={e} onClick={() => setEmoji(e)}
                className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center ${emoji === e ? 'bg-primary/15 ring-2 ring-primary' : 'bg-slate-100 dark:bg-white/5'}`}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Goal name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="School fees" maxLength={40} className="input" autoFocus />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Target amount (USD)</label>
          <input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="500" className="input text-xl font-bold" />
        </div>
        <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
          <label className="text-xs text-slate-500 block mb-1.5 flex items-center gap-1"><Sparkles size={12} /> Auto-save reminder (optional)</label>
          <div className="flex gap-2">
            <input type="number" value={autoAmt} onChange={e => setAutoAmt(e.target.value)} placeholder="Amount" className="input flex-1" />
            <select value={freq} onChange={e => setFreq(e.target.value as any)} className="input w-32">
              <option value="none">Off</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">We'll remind you to top up — you stay in control.</p>
        </div>
        <button onClick={create} disabled={busy} className="btn-primary w-full">{busy ? 'Creating…' : 'Create goal'}</button>
      </div>
    </Sheet>
  );
}

// ── Contribute / withdraw / delete on a goal ──────────────────────────────────
function GoalModal({ goal, onClose, onChanged }: { goal: Goal; onClose: () => void; onChanged: () => void }) {
  const [mode, setMode] = useState<'add' | 'take'>('add');
  const [amount, setAmount] = useState('');
  const [pin, setPin]   = useState('');
  const [step, setStep] = useState<'amount' | 'pin'>('amount');
  const [busy, setBusy] = useState(false);
  const amt = parseFloat(amount) || 0;
  const pct = Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100));

  async function submit() {
    setBusy(true);
    const path = mode === 'add' ? `/goals/${goal.id}/contribute` : `/goals/${goal.id}/withdraw`;
    const r = await goalsApi(path, 'POST', { amountUsdc: amt, pin });
    setBusy(false); setPin('');
    if (r.success) {
      toast.success(mode === 'add' ? (r.data.completed ? 'Goal reached! 🎉' : 'Saved 🌱') : 'Withdrawn');
      onChanged();
    } else { toast.error(r.error ?? 'Failed'); setStep('amount'); }
  }

  async function remove() {
    if (!confirm('Remove this goal? Your saved money stays in Savings.')) return;
    const r = await goalsApi(`/goals/${goal.id}`, 'DELETE');
    if (r.success) { toast.success('Goal removed'); onChanged(); } else toast.error(r.error ?? 'Failed');
  }

  return (
    <Sheet title={`${goal.emoji} ${goal.name}`} onClose={onClose}>
      {step === 'amount' ? (
        <div className="space-y-4">
          <div className="card bg-slate-50 dark:bg-white/5">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-500">{formatUsdc(goal.savedAmount)} saved</span>
              <span className="font-semibold">{pct}% of {formatUsdc(goal.targetAmount)}</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
              <div className="h-full bg-grad-brand rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-2xl p-1 gap-1">
            {(['add', 'take'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium capitalize ${mode === m ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-500'}`}>
                {m === 'add' ? 'Add money' : 'Take out'}
              </button>
            ))}
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Amount (USD)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="input text-2xl font-bold" autoFocus />
            {mode === 'take' && <p className="text-xs text-slate-500 mt-1">Available in this goal: {formatUsdc(goal.savedAmount)}</p>}
          </div>
          <button onClick={() => setStep('pin')} disabled={amt <= 0} className="btn-primary w-full">Continue</button>
          <button onClick={remove} className="w-full flex items-center justify-center gap-1.5 text-sm text-rose-500 py-2">
            <Trash2 size={15} /> Remove goal
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5">
          <p className="text-sm text-slate-500">{mode === 'add' ? 'Adding to' : 'Taking from'} {goal.name}</p>
          <p className="text-3xl font-bold text-primary">{formatUsdc(amt)}</p>
          <p className="text-sm text-slate-500">Enter PIN to confirm</p>
          <PinInput value={pin} onChange={setPin} autoFocus />
          <button onClick={submit} disabled={pin.length < 6 || busy} className="btn-primary w-full">
            {busy ? 'Processing…' : (mode === 'add' ? 'Add to goal' : 'Withdraw')}
          </button>
        </div>
      )}
    </Sheet>
  );
}

// ── Bottom sheet shell ────────────────────────────────────────────────────────
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
