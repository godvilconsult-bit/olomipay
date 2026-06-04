'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, RefreshCw, Copy, Send, Download, QrCode } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatUsdc, formatTzs } from '../lib/utils';
import { wallet, mobile_money } from '../lib/api';
import UserAvatar from './UserAvatar';

interface Props {
  publicKey?:     string;
  name?:          string;
  profilePicUrl?: string | null;
  userTag?:       string;
}

export default function BalanceCard({ publicKey, name, profilePicUrl, userTag }: Props) {
  const router = useRouter();
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
        mobile_money.rate().catch(() => ({ usdcToTzs: 2600 })),
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
    <div className="card bg-gradient-to-br from-[#1a3a6b] to-[#1a56db] text-white relative overflow-hidden">
      {/* Decorative circles */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full" />
      <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full" />
      {/* Logo watermark */}
      <img src="/logo.svg" alt="" className="absolute -right-4 -bottom-4 w-24 h-24 opacity-10" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          {/* Identity: avatar + name + unique tag (NO phone number exposed) */}
          <div className="flex items-center gap-2.5 min-w-0">
            <UserAvatar name={name} profilePicUrl={profilePicUrl} size="md"
              className="ring-2 ring-white/30" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {name || 'OlomiPay Wallet'}
              </p>
              {userTag && (
                <button
                  onClick={() => { navigator.clipboard.writeText(userTag); toast.success('Wallet ID copied'); }}
                  className="flex items-center gap-1 text-[11px] text-white/70 hover:text-white font-mono"
                >
                  {userTag} <Copy size={10} />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => load(true)}
              className="p-1.5 rounded-full hover:bg-white/10 min-h-[32px] min-w-[32px] flex items-center justify-center">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => setHidden(h => !h)}
              className="p-1.5 rounded-full hover:bg-white/10 min-h-[32px] min-w-[32px] flex items-center justify-center">
              {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Primary balance */}
        <p className="text-xs text-white/55 mb-1">Total balance</p>
        <div className="flex items-baseline gap-2">
          <span className="text-[2.6rem] leading-none font-bold tracking-tight">
            {hidden ? '••••••' : formatUsdc(usdcNum)}
          </span>
          <span className="text-base font-medium text-white/70">USD</span>
        </div>

        {/* TZS equivalent */}
        <div className="text-sm text-white/60 mt-1.5 mb-5">
          ≈ {hidden ? '•••' : formatTzs(tzsEquiv)} TZS
        </div>

        {/* Inline quick actions — consolidated here (no separate section) */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: 'Send',     icon: Send,     href: '/send'    },
            { label: 'Add money',icon: Download, href: '/deposit' },
            { label: 'Scan',     icon: QrCode,   href: '/scan'    },
          ].map(({ label, icon: Icon, href }) => (
            <button key={href} onClick={() => router.push(href)}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/15 hover:bg-white/25 backdrop-blur py-3 active:scale-95 transition-all">
              <Icon size={18} strokeWidth={2.1} />
              <span className="text-[11px] font-semibold">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
