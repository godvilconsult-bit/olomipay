'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Receipt, TrendingUp, Briefcase, History, LifeBuoy, AlertTriangle, Sparkles } from 'lucide-react';
import BalanceCard from '../../components/BalanceCard';
import BottomNav from '../../components/BottomNav';
import UserAvatar from '../../components/UserAvatar';
import { auth } from '../../lib/api';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const meRes = await auth.me();
        setUser(meRes.user);
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
        {/* Balance */}
        <BalanceCard
          publicKey={user?.stellarPubKey}
          name={user?.kycName}
          profilePicUrl={user?.profilePicUrl}
          userTag={user?.userTag}
        />

        {/* Secondary shortcuts — primary actions (Send/Add/Scan) live on the card */}
        <section className="grid grid-cols-4 gap-2.5">
          {[
            { label: 'Insights', icon: Sparkles,   href: '/insights', tint: 'text-amber-500 dark:text-amber-400' },
            { label: 'Bills',    icon: Receipt,    href: '/bills',    tint: 'text-violet-600 dark:text-violet-400'},
            { label: 'Grow',     icon: TrendingUp, href: '/grow',     tint: 'text-emerald-600 dark:text-emerald-400'},
            { label: 'Business', icon: Briefcase,  href: '/business', tint: 'text-blue-600 dark:text-blue-400'   },
            { label: 'Activity', icon: History,    href: '/history',  tint: 'text-primary dark:text-blue-400'    },
            { label: 'Support',  icon: LifeBuoy,   href: '/support',  tint: 'text-rose-600 dark:text-rose-400'   },
          ].map(({ label, icon: Icon, href, tint }) => (
            <button key={href} onClick={() => router.push(href)}
              className="flex flex-col items-center gap-2 active:scale-95 transition-transform">
              <div className={`w-full aspect-square max-w-[64px] rounded-2xl bg-white/70 dark:bg-white/5 backdrop-blur
                              border border-white/60 dark:border-white/10 shadow-sm flex items-center justify-center ${tint}`}>
                <Icon size={21} strokeWidth={1.9} />
              </div>
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{label}</span>
            </button>
          ))}

          {/* Activate wallet — only when the key needs re-activation */}
          {!loading && user && user.walletKeyValid === false && (
            <button onClick={() => router.push('/profile')}
              className="flex flex-col items-center gap-2 active:scale-95 transition-transform">
              <div className="w-full aspect-square max-w-[64px] rounded-2xl bg-amber-50 dark:bg-amber-500/10
                              border border-amber-300 dark:border-amber-700 shadow-sm flex items-center justify-center text-amber-600 dark:text-amber-400">
                <AlertTriangle size={21} strokeWidth={1.9} />
              </div>
              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 text-center leading-tight">Activate wallet</span>
            </button>
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
