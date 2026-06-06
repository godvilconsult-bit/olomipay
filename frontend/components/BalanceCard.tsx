'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import { formatUsdc, formatTzs } from '../lib/utils';
import { wallet, mobile_money } from '../lib/api';

interface Props {
  publicKey?:     string;
  name?:          string;
  profilePicUrl?: string | null;
  userTag?:       string;
}

export default function BalanceCard({}: Props) {
  const [usdc,      setUsdc]      = useState<string | null>(null);
  const [tzsRate,   setTzsRate]   = useState<number>(2600);
  const [hidden,    setHidden]    = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(quiet = false) {
    if (!quiet) setLoading(true);
    else        setRefreshing(true);
    try {
      const [balRes, rateRes] = await Promise.all([
        wallet.balance(),
        mobile_money.rate().catch(() => ({ usdcToTzs: 2600 })),
      ]);
      setUsdc(balRes.balance.usdc);
      setTzsRate(rateRes.usdcToTzs ?? 2600);
    } catch {
      // Keep last known value
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  const usdcNum  = parseFloat(usdc ?? '0');
  const tzsEquiv = usdcNum * tzsRate;

  if (loading) {
    return (
      <div className="card bg-gradient-to-br from-[#1a3a6b] to-[#1a56db] text-white py-4">
        <div className="skeleton h-3 w-20 bg-white/20 mb-2" />
        <div className="skeleton h-8 w-36 bg-white/20" />
      </div>
    );
  }

  return (
    <div className="card bg-gradient-to-br from-[#1a3a6b] to-[#1a56db] text-white relative overflow-hidden py-4">
      <div className="absolute -top-8 -right-8 w-28 h-28 bg-white/5 rounded-full" />

      <div className="relative z-10 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[11px] text-white/55">Total balance</p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-3xl leading-none font-bold tracking-tight">
              {hidden ? '••••••' : formatUsdc(usdcNum)}
            </span>
            <span className="text-sm font-medium text-white/70">USD</span>
          </div>
          <p className="text-xs text-white/60 mt-1">
            ≈ {hidden ? '•••' : formatTzs(tzsEquiv)}
          </p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => load(true)}
            className="p-2 rounded-full hover:bg-white/10 flex items-center justify-center">
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setHidden(h => !h)}
            className="p-2 rounded-full hover:bg-white/10 flex items-center justify-center">
            {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}
