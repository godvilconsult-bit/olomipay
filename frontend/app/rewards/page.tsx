'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Gift, Star, Copy, Zap } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import PageHeader from '../../components/PageHeader';

async function rewardsApi(path: string, method = 'GET', body?: any) {
  const token = (localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt'));
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/rewards${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const TIER_COLORS: Record<string, string> = {
  BRONZE:   'from-amber-700 to-amber-500',
  SILVER:   'from-slate-400 to-slate-300',
  GOLD:     'from-yellow-500 to-amber-400',
  PLATINUM: 'from-slate-300 to-white',
};

export default function RewardsPage() {
  const router  = useRouter();
  const [data,     setData]    = useState<any>(null);
  const [referral, setReferral] = useState<any>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([
      rewardsApi('/balance').then(r => r.success && setData(r.data)),
      rewardsApi('/referral').then(r => r.success && setReferral(r.data)),
    ]).finally(() => setLoading(false));
  }, []);

  async function handleRedeem(rewardType: string, points: number) {
    const r = await rewardsApi('/redeem', 'POST', { rewardType });
    if (r.success) {
      toast.success(r.data.message);
      rewardsApi('/balance').then(r => r.success && setData(r.data));
    } else toast.error(r.error ?? 'Redemption failed');
  }

  function copyReferral() {
    navigator.clipboard.writeText(referral?.referralLink ?? '');
    toast.success('Referral link copied!');
  }

  if (loading) {
    return (
      <div className="min-h-screen pb-24 px-5">
        <div className="skeleton h-40 rounded-3xl mt-20" />
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <PageHeader eyebrow="Loyalty" title="Rewards" />

      <div className="px-5 max-w-md mx-auto mt-4 space-y-4">
        {/* Points card */}
        <div className={`card bg-gradient-to-br ${TIER_COLORS[data?.tier ?? 'BRONZE']} text-white relative overflow-hidden`}>
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Star size={16} fill="currentColor" />
                <span className="text-sm font-semibold">{data?.tier ?? 'BRONZE'}</span>
              </div>
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                {data?.progress ?? 0}% to {data?.nextTier ?? 'max'}
              </span>
            </div>
            <p className="text-4xl font-bold">{(data?.balance ?? 0).toLocaleString()}</p>
            <p className="text-sm text-white/70">points</p>
            {/* Progress bar */}
            <div className="mt-3 h-1.5 bg-white/20 rounded-full">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: `${data?.progress ?? 0}%` }} />
            </div>
          </div>
        </div>

        {/* How to earn */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3 flex items-center gap-2">
            <Zap size={14} className="text-amber-500" /> How to earn points
          </h3>
          <div className="space-y-2 text-sm">
            {[
              ['Send money',       '1 pt per 1,000 TZS'],
              ['Pay a bill',       '5 points'],
              ['Refer a friend',   '500 points'],
              ['First stake',      '200 points'],
              ['30-day streak',    '100 bonus points'],
            ].map(([action, reward]) => (
              <div key={action as string} className="flex justify-between">
                <span className="text-slate-500">{action as string}</span>
                <span className="font-medium text-amber-600">{reward as string}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Redeem catalog */}
        <h3 className="text-sm font-semibold text-slate-500">Redeem rewards</h3>
        {(!data?.catalog || data.catalog.length === 0) && (
          <div className="card text-center py-8 text-slate-400">
            <p className="text-3xl mb-2">🎁</p>
            <p className="text-sm font-medium">No rewards to redeem yet</p>
            <p className="text-xs mt-1">Keep transacting to unlock redeemable rewards.</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {data?.catalog?.map((item: any) => (
            <button key={item.id} onClick={() => handleRedeem(item.id, item.points)}
              disabled={(data?.balance ?? 0) < item.points}
              className="card text-left active:scale-95 transition-transform disabled:opacity-50">
              <div className="text-2xl mb-2">
                {item.id === 'fee_waiver' ? '🎫' : item.id.includes('airtime') ? '📱' : '💵'}
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-tight">{item.label}</p>
              <p className="text-xs text-slate-400 mt-0.5 mb-2">{item.description}</p>
              <p className="text-xs font-bold text-amber-600">{item.points.toLocaleString()} pts</p>
            </button>
          ))}
        </div>

        {/* Referral card */}
        {referral && (
          <div className="card">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3 flex items-center gap-2">
              <Gift size={14} className="text-primary" /> Refer friends
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Earn {referral.pointsPerReferral} points for every friend who registers and completes KYC.
            </p>
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
              <p className="text-xs font-mono text-slate-600 dark:text-slate-400 flex-1 truncate">
                {referral.referralLink}
              </p>
              <button onClick={copyReferral} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 min-h-[32px] min-w-[32px] flex items-center justify-center">
                <Copy size={14} className="text-slate-500" />
              </button>
            </div>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
