'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, RefreshCw, ArrowUp, Plus, QrCode } from 'lucide-react';
import { formatUsdc, formatTzs } from '../lib/utils';
import { wallet, mobile_money } from '../lib/api';

interface Props {
  publicKey?:     string;
  name?:          string;
  profilePicUrl?: string | null;
  userTag?:       string;
}

/**
 * Hero balance card — the most-seen surface in the app, so it carries the brand.
 * Premium fintech treatment (layered gradient + aurora glow + glass quick-actions)
 * in the spirit of Cash App / Revolut, but with our single-USD, crypto-invisible
 * model. Primary actions (Send / Add / Scan) live right on the card.
 */
export default function BalanceCard({ userTag }: Props) {
  const router = useRouter();
  const [usdc,       setUsdc]       = useState<string | null>(null);
  const [tzsRate,    setTzsRate]    = useState<number>(2600);
  const [hidden,     setHidden]     = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(quiet = false) {
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const [balRes, rateRes] = await Promise.all([
        wallet.balance(),
        mobile_money.rate().catch(() => ({ usdcToTzs: 2600 })),
      ]);
      setUsdc(balRes.balance.usdc);
      setTzsRate(rateRes.usdcToTzs ?? 2600);
    } catch { /* keep last known value */ }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  const usdcNum  = parseFloat(usdc ?? '0');
  const tzsEquiv = usdcNum * tzsRate;
  // Split the amount so we can de-emphasise the cents (fintech hero convention).
  const [whole, cents] = formatUsdc(usdcNum).replace(/^\$/, '').split('.');

  const actions = [
    { label: 'Send',  icon: ArrowUp, href: '/send'    },
    { label: 'Add',   icon: Plus,    href: '/deposit' },
    { label: 'Scan',  icon: QrCode,  href: '/scan'    },
  ];

  return (
    <div className="relative overflow-hidden rounded-[1.75rem] p-5 text-white shadow-[0_20px_50px_-20px_rgba(26,86,219,0.55)]
                    bg-[linear-gradient(135deg,#0b2150_0%,#163e8e_48%,#1a56db_100%)]">
      {/* Aurora accents */}
      <div className="pointer-events-none absolute -top-16 -left-10 h-44 w-44 rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -right-10 h-52 w-52 rounded-full bg-emerald-400/20 blur-3xl" />
      {/* Hairline sheen */}
      <div className="pointer-events-none absolute inset-0 rounded-[1.75rem] ring-1 ring-inset ring-white/10" />

      <div className="relative z-10">
        {/* Top row */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/55">Total balance</p>
            {userTag && (
              <p className="mt-0.5 text-[11px] font-medium text-white/45">{userTag}</p>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={() => load(true)} aria-label="Refresh balance"
              className="rounded-full p-2 text-white/70 hover:bg-white/10 active:scale-90 transition">
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => setHidden(h => !h)} aria-label={hidden ? 'Show balance' : 'Hide balance'}
              className="rounded-full p-2 text-white/70 hover:bg-white/10 active:scale-90 transition">
              {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {/* Amount */}
        <div className="mt-2 min-h-[44px]">
          {loading ? (
            <div className="skeleton h-9 w-40 bg-white/20" />
          ) : hidden ? (
            <p className="text-[2.6rem] font-bold leading-none tracking-tight tabular-nums">••••••</p>
          ) : (
            <div className="flex items-baseline gap-1">
              <span className="text-[1.4rem] font-semibold leading-none text-white/75">$</span>
              <span className="text-[2.6rem] font-bold leading-none tracking-tight tabular-nums">{whole}</span>
              <span className="text-xl font-semibold leading-none text-white/60 tabular-nums">.{cents}</span>
            </div>
          )}
          <p className="mt-1.5 text-xs text-white/55 tabular-nums">
            ≈ {hidden ? '••••••' : formatTzs(tzsEquiv)}
          </p>
        </div>

        {/* Quick actions */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {actions.map(({ label, icon: Icon, href }) => (
            <button key={href} onClick={() => router.push(href)}
              className="group flex flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-white/10
                         py-2.5 backdrop-blur-sm transition active:scale-95 hover:bg-white/15">
              <Icon size={18} className="text-white" strokeWidth={2.2} />
              <span className="text-[11px] font-semibold text-white/90">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
