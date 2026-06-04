'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import BalanceCard from '../../components/BalanceCard';
import QuickActions from '../../components/QuickActions';
import TransactionItem from '../../components/TransactionItem';
import BottomNav from '../../components/BottomNav';
import UserAvatar from '../../components/UserAvatar';
import { auth, wallet } from '../../lib/api';

/** Time-aware greeting for the header eyebrow. */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

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
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 px-5 pt-safe-top pt-4 pb-3">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            <UserAvatar
              name={user?.kycName}
              profilePicUrl={user?.profilePicUrl}
              size="md"
              onClick={() => router.push('/profile')}
              className="ring-2 ring-primary/15"
            />
            <div className="min-w-0">
              <p className="ds-eyebrow !text-[10px] text-slate-400">{greeting()}</p>
              <p className="font-bold text-slate-800 dark:text-slate-100 truncate leading-tight">
                {loading ? '…' : (user?.kycName || user?.userTag || 'OlomiPay User')}
              </p>
            </div>
          </div>
          <button onClick={() => router.push('/notifications')}
            className="relative p-2.5 rounded-full bg-white/70 dark:bg-white/5 backdrop-blur border border-white/60 dark:border-white/10 shadow-sm min-h-[44px] min-w-[44px] flex items-center justify-center active:scale-95 transition-transform">
            <Bell size={19} className="text-slate-600 dark:text-slate-300" />
          </button>
        </div>
      </div>

      <div className="px-5 max-w-md mx-auto space-y-5 mt-2">
        {/* Wallet health banner — corrupt/legacy key needs re-activation */}
        {!loading && user && user.walletKeyValid === false && (
          <button onClick={() => router.push('/profile')}
            className="w-full flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3.5 text-left active:scale-[0.99] transition-transform">
            <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-800/40 flex items-center justify-center flex-shrink-0">
              <span className="text-lg">⚠️</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Your wallet needs re-activation</p>
              <p className="text-xs text-amber-600/80 dark:text-amber-500">Payments may fail until you re-activate. Tap to fix it →</p>
            </div>
          </button>
        )}

        {/* Balance */}
        <BalanceCard
          publicKey={user?.stellarPubKey}
          name={user?.kycName}
          profilePicUrl={user?.profilePicUrl}
          userTag={user?.userTag}
        />

        {/* Quick actions */}
        <section>
          <h2 className="ds-eyebrow mb-3">Quick actions</h2>
          <QuickActions />
        </section>

        {/* Recent transactions */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="ds-eyebrow">Recent activity</h2>
            <button onClick={() => router.push('/history')} className="text-xs text-primary font-semibold min-h-[32px] px-2 active:scale-95 transition-transform">
              View all →
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
