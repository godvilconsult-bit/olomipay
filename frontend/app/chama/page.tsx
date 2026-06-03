'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Users, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import { formatUsdc } from '../../lib/utils';

async function chamaApi(path: string, method = 'GET', body?: any) {
  const token = (sessionStorage.getItem('olomipay_at') || sessionStorage.getItem('olomipay_rt'));
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chama${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export default function ChamaPage() {
  const router  = useRouter();
  const [chamas,   setChamas]   = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', contributionUsdc: '', memberPhones: '', frequencyDays: '30',
  });

  useEffect(() => {
    chamaApi('/list').then(r => { if (r.success) setChamas(r.data.chamas); setLoading(false); });
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const phones = form.memberPhones.split(',').map(p => p.trim()).filter(Boolean);
    const r = await chamaApi('/create', 'POST', {
      name:             form.name,
      contributionUsdc: parseFloat(form.contributionUsdc),
      memberPhones:     phones,
      frequencyDays:    parseInt(form.frequencyDays),
    });
    if (r.success) {
      toast.success('Chama created!');
      setChamas(c => [r.data.chama, ...c]);
      setShowForm(false);
    } else toast.error(r.error ?? 'Failed');
  }

  async function handleContribute(chamaId: string) {
    const pin = prompt('Enter PIN to contribute:');
    if (!pin) return;
    const r = await chamaApi('/contribute', 'POST', { chamaId, pin });
    if (r.success) toast.success('Contribution sent!');
    else toast.error(r.error ?? 'Failed');
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-24">
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold flex-1">Chama Groups</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 text-sm text-primary font-medium min-h-[44px] px-2">
          <Plus size={16} /> New
        </button>
      </div>

      <div className="px-5 max-w-md mx-auto mt-4 space-y-4">
        {/* Info card */}
        <div className="card bg-gradient-to-br from-primary to-blue-700 text-white">
          <p className="text-sm font-semibold mb-1">What is a Chama?</p>
          <p className="text-xs text-white/80">
            A rotating savings group where members contribute each month and take turns receiving the full pot.
            All funds secured by smart contracts · settled on-chain.
          </p>
        </div>

        {/* Create form */}
        {showForm && (
          <form onSubmit={handleCreate} className="card space-y-3">
            <h3 className="font-semibold">Create New Chama</h3>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Chama name</label>
              <input type="text" placeholder="e.g. Mama's Savings Group" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" required />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Monthly contribution (USDC)</label>
              <input type="number" placeholder="50" value={form.contributionUsdc}
                onChange={e => setForm(f => ({ ...f, contributionUsdc: e.target.value }))} className="input" required />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Member phones (comma separated)</label>
              <textarea placeholder="+255712345678, +255787654321" value={form.memberPhones}
                onChange={e => setForm(f => ({ ...f, memberPhones: e.target.value }))}
                className="input min-h-[80px] resize-none" required />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Contribution frequency</label>
              <select value={form.frequencyDays}
                onChange={e => setForm(f => ({ ...f, frequencyDays: e.target.value }))} className="input">
                <option value="7">Weekly</option>
                <option value="14">Every 2 weeks</option>
                <option value="30">Monthly</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1">Create Chama</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </form>
        )}

        {/* Chama list */}
        {loading ? (
          <div className="space-y-3">{[1,2].map(i => <div key={i} className="skeleton h-32 rounded-3xl" />)}</div>
        ) : chamas.length === 0 && !showForm ? (
          <div className="text-center py-16">
            <Users size={40} className="text-slate-300 mx-auto mb-3" />
            <p className="font-medium text-slate-400">No chamas yet</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">Create a group or ask to be invited</p>
            <button onClick={() => setShowForm(true)} className="btn-primary px-6">Create first chama</button>
          </div>
        ) : (
          chamas.map(chama => {
            const totalMembers   = chama.members?.length ?? 0;
            const potSize        = chama.contributionUsdc * totalMembers;
            const nextRecipient  = chama.members?.[chama.currentRound % totalMembers];

            return (
              <div key={chama.id} className="card space-y-4">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-xl flex-shrink-0">
                    🤝
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{chama.name}</p>
                    <p className="text-xs text-slate-500">{totalMembers} members · Round {chama.currentRound + 1}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    chama.status === 'ACTIVE' ? 'bg-success/10 text-success' :
                    chama.status === 'FORMING' ? 'bg-amber-100 text-amber-600' :
                    'bg-slate-100 text-slate-500'
                  }`}>{chama.status}</span>
                </div>

                {/* Pot size */}
                <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-3 flex justify-between text-sm">
                  <div>
                    <p className="text-xs text-slate-400">Each contributes</p>
                    <p className="font-semibold">{formatUsdc(chama.contributionUsdc)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Total pot</p>
                    <p className="font-semibold text-success">{formatUsdc(potSize)}</p>
                  </div>
                </div>

                {/* Member grid */}
                <div>
                  <p className="text-xs text-slate-500 mb-2">Members</p>
                  <div className="flex flex-wrap gap-2">
                    {chama.members?.map((m: any, i: number) => (
                      <div key={m.id}
                        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
                          m.hasReceived ? 'bg-success/10 text-success' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                        }`}>
                        {m.hasReceived ? <CheckCircle size={10} /> : <Clock size={10} />}
                        {m.user?.phone?.slice(-6) ?? `Member ${i + 1}`}
                      </div>
                    ))}
                  </div>
                </div>

                <button onClick={() => handleContribute(chama.id)}
                  className="btn-primary w-full text-sm">
                  Contribute {formatUsdc(chama.contributionUsdc)}
                </button>
              </div>
            );
          })
        )}
      </div>
      <BottomNav />
    </div>
  );
}
