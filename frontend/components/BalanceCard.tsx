'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import { formatUsdc, formatTzs } from '../lib/utils';
import { wallet, mpesa } from '../lib/api';

interface Props {
  publicKey?: string;
}

export default function BalanceCard({ publicKey }: Props) {
  const [usdc,      setUsdc]      = useState<string | null>(null);
  const [xlm,       setXlm]       = useState<string | null>(null);
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
        mpesa.rate().catch(() => ({ usdcToTzs: 2600 })),
      ]);
      setUsdc(balRes.balance.usdc);
      setXlm(balRes.balance.xlm);
      setTzsRate(rateRes.usdcToTzs ?? 2600);
    } catch {
      // Keep last known value
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  const usdcNum = parseFloat(usdc ?? '0');
  const tzsEquiv = usdcNum * tzsRate;

  if (loading) {
    return (
      <div className="card bg-gradient-to-br from-primary to-primary-dark text-white">
        <div className="skeleton h-5 w-24 bg-white/20 mb-4" />
        <div className="skeleton h-12 w-40 bg-white/20 mb-2" />
        <div className="skeleton h-4 w-32 bg-white/20" />
      </div>
    );
  }

  return (
    <div className="card bg-gradient-to-br from-[#1a56db] to-[#1e40af] text-white relative overflow-hidden">
      {/* Decorative circles */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full" />
      <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-white/70">Total Balance</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => load(true)}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
              aria-label="Refresh balance"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setHidden(h => !h)}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
              aria-label={hidden ? 'Show balance' : 'Hide balance'}
            >
              {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Primary balance — USDC */}
        <div className="mb-1">
          <span className="text-4xl font-bold tracking-tight">
            {hidden ? '••••••' : formatUsdc(usdcNum)}
          </span>
          <span className="ml-2 text-lg font-medium text-white/70">USDC</span>
        </div>

        {/* TZS equivalent */}
        <div className="text-sm text-white/60 mb-4">
          ≈ {hidden ? '•••' : formatTzs(tzsEquiv)}
        </div>

        {/* XLM sub-balance */}
        <div className="flex items-center gap-2 text-xs text-white/50">
          <span>{hidden ? '••' : `${parseFloat(xlm ?? '0').toFixed(2)} XLM`}</span>
          <span>·</span>
          <span>Stellar Network</span>
          {publicKey && (
            <>
              <span>·</span>
              <span className="font-mono">
                {publicKey.slice(0, 4)}...{publicKey.slice(-4)}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
