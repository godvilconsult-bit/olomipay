'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Users, TrendingUp, DollarSign, Activity, AlertCircle, Building2 } from 'lucide-react';
import { formatUsdc } from '../../lib/utils';

async function adminApi(path: string) {
  const token = sessionStorage.getItem('olomipay_rt');
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm">
      <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-3`}>
        <Icon size={20} className="text-white" />
      </div>
      <p className="text-2xl font-bold text-slate-800 dark:text-slate-200">{value}</p>
      <p className="text-sm text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [stats,   setStats]   = useState<any>(null);
  const [users,   setUsers]   = useState<any[]>([]);
  const [flagged, setFlagged] = useState<any[]>([]);
  const [live,    setLive]    = useState<any>(null);
  const [tab,     setTab]     = useState<'overview'|'users'|'flagged'>('overview');

  useEffect(() => {
    adminApi('/stats').then(r => r.success && setStats(r.data));
    adminApi('/users').then(r => r.success && setUsers(r.data.users ?? []));
    adminApi('/transactions/flagged').then(r => r.success && setFlagged(r.data.flagged ?? []));
    const es = new EventSource(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/live`);
    es.onmessage = (e) => { try { setLive(JSON.parse(e.data)); } catch {} };
    return () => es.close();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-900 border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-sm">T</div>
          <h1 className="text-xl font-bold">Tuma Admin</h1>
          {live && <span className="text-xs bg-success/10 text-success px-3 py-1 rounded-full font-medium">● Live</span>}
        </div>
        <button onClick={() => router.push('/dashboard')} className="text-sm text-slate-500">← Back to app</button>
      </div>

      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex gap-2 mb-6 flex-wrap">
          {(['overview', 'users', 'flagged'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-medium capitalize ${tab === t ? 'bg-primary text-white' : 'bg-white dark:bg-slate-800 text-slate-500'}`}>
              {t}{t === 'flagged' && flagged.length > 0 && <span className="ml-1 bg-danger text-white text-xs px-1 rounded-full">{flagged.length}</span>}
            </button>
          ))}
        </div>

        {tab === 'overview' && stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Users}       label="Total Users"       value={live?.users ?? stats.users.total}                              color="bg-primary"    />
            <StatCard icon={DollarSign}  label="Volume (USDC)"     value={formatUsdc(live?.volumeUsdc ?? stats.transactions.volumeUsdc)} color="bg-success"    />
            <StatCard icon={TrendingUp}  label="Fees Collected"    value={formatUsdc(stats.revenue.feesUsdc)}                            color="bg-amber-500"  />
            <StatCard icon={Activity}    label="Transactions"      value={stats.transactions.total.toLocaleString()}                      color="bg-indigo-500" />
            <StatCard icon={TrendingUp}  label="Active Stakes"     value={stats.staking.activePositions} sub={`${formatUsdc(stats.staking.totalStaked)} locked`} color="bg-orange-500" />
            <StatCard icon={Users}       label="Active Chamas"     value={stats.chamas.active}           color="bg-teal-500"   />
            <StatCard icon={AlertCircle} label="Default Rate"      value={stats.lending.defaultRate}     color="bg-red-500"    />
            <StatCard icon={Building2}   label="Business Clients"  value={stats.business.clients}        color="bg-slate-600"  />
          </div>
        )}

        {tab === 'users' && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 font-semibold">Users ({users.length})</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/50">
                  <tr>{['Phone','Name','KYC','Country','Joined'].map(h => <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20">
                      <td className="px-6 py-3 font-mono text-xs">{u.phone}</td>
                      <td className="px-6 py-3">{u.kycName ?? '—'}</td>
                      <td className="px-6 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.kycStatus === 'APPROVED' ? 'bg-success/10 text-success' : 'bg-amber-100 text-amber-600'}`}>{u.kycStatus}</span></td>
                      <td className="px-6 py-3 text-slate-400">{u.country}</td>
                      <td className="px-6 py-3 text-xs text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'flagged' && (
          <div className="space-y-3">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-2xl p-4 text-sm text-amber-700">
              ⚠️ Transactions over $500 flagged for AML review.
            </div>
            {flagged.map(tx => (
              <div key={tx.id} className="bg-white dark:bg-slate-800 rounded-2xl p-5">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-bold">{formatUsdc(tx.amountUsdc ?? 0)}</p>
                    <p className="text-xs text-slate-400">{tx.user?.phone} · {tx.user?.kycName ?? 'Unverified'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="text-xs bg-success/10 text-success px-3 py-1.5 rounded-xl">Approve</button>
                    <button className="text-xs bg-danger/10 text-danger px-3 py-1.5 rounded-xl">Freeze</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
