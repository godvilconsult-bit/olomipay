'use client';

/* Limits & verification — shows the user's account level, what they can do, how
   much of today's/this-month's limit they've used, and how to level up. */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ShieldCheck, Lock, CheckCircle2, ChevronRight } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import PageHeader from '../../components/PageHeader';
import { kyc } from '../../lib/api';

const $ = (n: number) => `$${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const LEVEL_NAMES = ['New', 'Basic', 'Verified', 'Enhanced'];
const FEATURE_LABEL: Record<string, string> = {
  send: 'Send money', remittance: 'Send abroad', bank: 'Bank withdrawal',
  agent_cashout: 'Cash out at agents', become_agent: 'Become an agent',
};

export default function LimitsPage() {
  const router = useRouter();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => kyc.tier().then(setD).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function saveBasic() {
    if (name.trim().length < 2) { toast.error('Enter your full name'); return; }
    setBusy(true);
    try { await kyc.basic(name.trim()); toast.success('Limits raised 🎉'); load(); }
    catch (e: any) { toast.error(e?.message ?? 'Failed'); }
    finally { setBusy(false); }
  }

  const level = d?.level ?? 0;
  const dayPct   = d ? Math.min(100, Math.round((d.usedToday / d.limits.dailyUsdc) * 100)) : 0;
  const monthPct = d ? Math.min(100, Math.round((d.usedMonth / d.limits.monthlyUsdc) * 100)) : 0;

  return (
    <div className="min-h-screen pb-24">
      <PageHeader eyebrow="Account" title="Limits & verification" />

      <div className="px-5 max-w-md mx-auto mt-4 space-y-4">
        {loading ? (
          <div className="card"><div className="skeleton h-20 w-full" /></div>
        ) : !d ? (
          <div className="card text-center text-slate-400 py-10">Couldn't load your limits.</div>
        ) : (
          <>
            {/* Current level */}
            <div className="card bg-gradient-to-br from-[#1a3a6b] to-[#1a56db] text-white">
              <div className="flex items-center gap-2 text-white/80 text-sm"><ShieldCheck size={16} /> Account level</div>
              <p className="text-3xl font-bold mt-1">{d.label}</p>
              <p className="text-sm text-white/70">Level {level} of 3</p>
            </div>

            {/* Usage */}
            <div className="card space-y-4">
              <Bar label="Today" used={d.usedToday} limit={d.limits.dailyUsdc} pct={dayPct} />
              <Bar label="This month" used={d.usedMonth} limit={d.limits.monthlyUsdc} pct={monthPct} />
              <p className="text-xs text-slate-400">Per transaction up to {$(d.limits.perTxUsdc)}.</p>
            </div>

            {/* What you can do */}
            <div className="card">
              <p className="font-semibold mb-2 text-sm">What you can do now</p>
              <div className="space-y-1.5">
                {Object.entries(FEATURE_LABEL).map(([k, label]) => {
                  const on = d.features.includes(k);
                  return (
                    <div key={k} className="flex items-center gap-2 text-sm">
                      {on ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Lock size={15} className="text-slate-300" />}
                      <span className={on ? '' : 'text-slate-400'}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Upgrade */}
            {level === 0 && (
              <div className="card border border-primary/30">
                <p className="font-semibold text-sm">Raise your limits — add your name</p>
                <p className="text-xs text-slate-500 mt-0.5 mb-3">Takes 10 seconds. Unlocks higher limits and sending money abroad.</p>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="input mb-2" />
                <button onClick={saveBasic} disabled={busy} className="btn-primary w-full">{busy ? 'Saving…' : 'Continue'}</button>
              </div>
            )}
            {level === 1 && (
              <button onClick={() => router.push('/profile')} className="card w-full flex items-center gap-3 text-left border border-primary/30">
                <ShieldCheck className="text-primary" />
                <div className="flex-1">
                  <p className="font-semibold text-sm">Verify your ID to go Verified</p>
                  <p className="text-xs text-slate-500">Higher limits + cash agents + bank withdrawals</p>
                </div>
                <ChevronRight className="text-slate-400" size={18} />
              </button>
            )}
            {level >= 2 && d.upgradeHint && (
              <p className="text-xs text-center text-slate-400 px-4">{d.upgradeHint}</p>
            )}

            {/* All tiers */}
            <div className="card">
              <p className="font-semibold mb-3 text-sm">All levels</p>
              <div className="space-y-2">
                {d.allTiers.map((t: any) => (
                  <div key={t.level} className={`flex justify-between items-center text-sm rounded-xl px-3 py-2 ${t.level === level ? 'bg-primary/10' : ''}`}>
                    <span className="font-medium">{LEVEL_NAMES[t.level]}{t.level === level && ' ·  you'}</span>
                    <span className="text-slate-500 text-xs">{$(t.perTxUsdc)}/tx · {$(t.dailyUsdc)}/day</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}

function Bar({ label, used, limit, pct }: { label: string; used: number; limit: number; pct: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-500">{label}</span>
        <span className="font-semibold">{$(used)} / {$(limit)}</span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${pct >= 90 ? 'bg-rose-500' : 'bg-grad-brand'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
