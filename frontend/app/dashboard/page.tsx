'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import BalanceCard from '../../components/BalanceCard';
import QuickActions from '../../components/QuickActions';
import TransactionItem from '../../components/TransactionItem';
import BottomNav from '../../components/BottomNav';
import { auth, wallet } from '../../lib/api';
import { formatPhone } from '../../lib/utils';

export default function DashboardPage() {
  const router = useRouter();
  const [user,   setUser]   = useState<any>(null);
  const [txs,    setTxs]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [meRes, histRes] = await Promise.all([
          auth.me(),
          wallet.history(5, 0),
        ]);
        setUser(meRes.user);
        setTxs(histRes.transactions ?? []);
      } catch {
        router.replace('/auth/login');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-slate-50 dark:bg-slate-900 px-5 pt-safe-top pt-4 pb-2">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <div>
            <p className="text-xs text-slate-400">Good day,</p>
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              {loading ? '…' : formatPhone(user?.phone ?? '')}
            </p>
          </div>
          <button className="p-2 rounded-full bg-white dark:bg-slate-800 shadow-sm min-h-[44px] min-w-[44px] flex items-center justify-center">
            <Bell size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
        </div>
      </div>

      <div className="px-5 max-w-md mx-auto space-y-5 mt-2">
        {/* Balance */}
        <BalanceCard publicKey={user?.stellarPubKey} />

        {/* Quick actions */}
        <section>
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3">Quick actions</h2>
          <QuickActions />
        </section>

        {/* Recent transactions */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400">Recent</h2>
            <button onClick={() => router.push('/history')} className="text-xs text-primary font-medium min-h-[32px] px-2">
              View all
            </button>
          </div>

          {loading ? (
            <div className="card space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-3 items-center">
                  <div className="skeleton w-10 h-10 rounded-2xl" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-3.5 w-32" />
                    <div className="skeleton h-3 w-20" />
                  </div>
                  <div className="skeleton h-4 w-16" />
                </div>
              ))}
            </div>
          ) : txs.length === 0 ? (
            <div className="card text-center py-10 text-slate-400 text-sm">
              <p className="text-2xl mb-2">📭</p>
              <p>No transactions yet</p>
              <p className="text-xs mt-1">Deposit TZS to get started</p>
            </div>
          ) : (
            <div className="card">
              {txs.map(tx => <TransactionItem key={tx.id} tx={tx} />)}
            </div>
          )}
        </section>

        {/* KYC banner */}
        {!loading && user?.kycStatus === 'PENDING' && (
          <div
            onClick={() => router.push('/profile')}
            className="card bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 cursor-pointer active:scale-[0.98] transition-transform"
          >
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              ⚠️ Complete KYC to increase your limits
            </p>
            <p className="text-xs text-amber-600/70 dark:text-amber-500 mt-0.5">
              Tap to verify your identity →
            </p>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
