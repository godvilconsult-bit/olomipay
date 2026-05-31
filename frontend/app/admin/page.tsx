'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Users, TrendingUp, DollarSign, Activity } from 'lucide-react';
import TransactionItem from '../../components/TransactionItem';
import { admin } from '../../lib/api';
import { formatUsdc, formatTzs } from '../../lib/utils';

export default function AdminPage() {
  const router = useRouter();
  const [stats,   setStats]   = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    admin.stats()
      .then(setStats)
      .catch(() => router.replace('/dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const STAT_CARDS = stats ? [
    { label: 'Total users',    value: stats.totalUsers.toLocaleString(), icon: Users,      color: 'text-blue-500'  },
    { label: 'Transactions',   value: stats.totalTransactions.toLocaleString(), icon: Activity, color: 'text-purple-500' },
    { label: 'Volume (USDC)',  value: formatUsdc(stats.totalVolumeUsdc), icon: TrendingUp, color: 'text-green-500' },
    { label: 'Fees collected', value: formatUsdc(stats.estimatedFeesUsdc), icon: DollarSign, color: 'text-amber-500' },
  ] : [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">OlomiPay platform overview</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="skeleton h-28 rounded-3xl" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {STAT_CARDS.map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="card">
                  <Icon size={24} className={`${color} mb-3`} strokeWidth={1.5} />
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Platform balance */}
            <div className="card">
              <h2 className="text-sm font-semibold text-slate-500 mb-3">Platform Fee Account Balance</h2>
              <div className="flex gap-6">
                <div>
                  <p className="text-xl font-bold">{formatUsdc(stats.platformBalance?.usdc ?? 0)}</p>
                  <p className="text-xs text-slate-400">USDC</p>
                </div>
                <div>
                  <p className="text-xl font-bold">{stats.platformBalance?.xlm ?? '0'} XLM</p>
                  <p className="text-xs text-slate-400">XLM</p>
                </div>
              </div>
            </div>

            {/* Recent transactions */}
            <div className="card">
              <h2 className="text-sm font-semibold text-slate-500 mb-3">Recent Transactions</h2>
              {stats.recentTransactions.map((tx: any) => (
                <div key={tx.id} className="flex items-center gap-3 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.user?.phone}</p>
                    <p className="text-xs text-slate-400">{tx.type} · {tx.status}</p>
                  </div>
                  <div className="text-sm font-semibold text-right">
                    {tx.amountUsdc ? formatUsdc(tx.amountUsdc) : formatTzs(tx.amountTzs ?? 0)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
