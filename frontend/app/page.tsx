'use client';

/* ════════════════════════════════════════════════════════════════════════════
   OlomiPay — Landing (dark "2030" skin)
   Ported faithfully from the UI kit (ui_kits/app/marketing.jsx → Landing).
   Single immersive hero: aurora orbs + drifting world-currency activity stream
   + "Send money like you chat." Nothing from the old marketing page is reused.
   ════════════════════════════════════════════════════════════════════════════ */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import AlreadyAuthed from '../components/AlreadyAuthed';

// ── Ambient feed — world flags + currencies drifting behind the hero ──────────
const FEED_A = [
  { kind: 'currency', flag: '🇹🇿', country: 'Tanzania',     code: 'TZS', rate: '2,600', accent: '#1a56db' },
  { kind: 'transfer', f1: '🇰🇪', f2: '🇺🇸', amt: '$24.00', label: 'Kenya → USA' },
  { kind: 'currency', flag: '🇳🇬', country: 'Nigeria',      code: 'NGN', rate: '1,580', accent: '#16a34a' },
  { kind: 'currency', flag: '🇯🇵', country: 'Japan',        code: 'JPY', rate: '157',   accent: '#dc2626' },
  { kind: 'transfer', f1: '🇬🇭', f2: '🇬🇧', amt: '$50.00', label: 'Ghana → UK' },
  { kind: 'currency', flag: '🇿🇦', country: 'South Africa', code: 'ZAR', rate: '18.4',  accent: '#d97706' },
  { kind: 'currency', flag: '🇮🇳', country: 'India',        code: 'INR', rate: '83.5',  accent: '#a855f7' },
  { kind: 'transfer', f1: '🇺🇬', f2: '🇸🇦', amt: '$35.00', label: 'Uganda → Saudi' },
] as const;
const FEED_B = [
  { kind: 'currency', flag: '🇬🇧', country: 'United Kingdom', code: 'GBP', rate: '0.79', accent: '#2563eb' },
  { kind: 'currency', flag: '🇩🇪', country: 'Germany',        code: 'EUR', rate: '0.93', accent: '#1e40af' },
  { kind: 'transfer', f1: '🇷🇼', f2: '🇦🇪', amt: '$30.00',   label: 'Rwanda → UAE' },
  { kind: 'currency', flag: '🇨🇳', country: 'China',          code: 'CNY', rate: '7.24', accent: '#dc2626' },
  { kind: 'currency', flag: '🇧🇷', country: 'Brazil',         code: 'BRL', rate: '4.97', accent: '#16a34a' },
  { kind: 'transfer', f1: '🇿🇲', f2: '🇨🇦', amt: '$60.00',   label: 'Zambia → Canada' },
  { kind: 'currency', flag: '🇦🇺', country: 'Australia',      code: 'AUD', rate: '1.53', accent: '#0891b2' },
  { kind: 'currency', flag: '🇦🇪', country: 'UAE',            code: 'AED', rate: '3.67', accent: '#f59e0b' },
] as const;

function ActCard(c: any, key: number) {
  const base: React.CSSProperties = {
    marginBottom: 12, borderRadius: 16, padding: '10px 13px',
    background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.11)',
    backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', gap: 10,
    boxShadow: '0 8px 24px -14px rgba(0,0,0,.8)',
  };
  if (c.kind === 'currency') {
    return (
      <div key={key} style={{ ...base, borderLeft: `3px solid ${c.accent}` }}>
        <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{c.flag}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.2 }}>{c.country}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            <span style={{ fontWeight: 600, color: c.accent }}>{c.code}</span>
            <span style={{ color: '#475569' }}> · 1 USD = {c.rate}</span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div key={key} style={base}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>{c.f1}</span>
      <div style={{ width: 18, height: 1.5, background: 'rgba(52,211,153,.6)', borderRadius: 999, flexShrink: 0 }} />
      <span style={{ fontSize: 20, flexShrink: 0 }}>{c.f2}</span>
      <div style={{ flex: 1, minWidth: 0, marginLeft: 2 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{c.amt}</div>
        <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{c.label} · ✓ settled</div>
      </div>
    </div>
  );
}

function ActivityStream() {
  const col = (items: readonly any[], dur: string, side: 'left' | 'right', offset: number) => (
    <div style={{ position: 'absolute', top: 0, [side]: -6, width: 192, height: '100%', overflow: 'hidden' } as React.CSSProperties}>
      <div className="olo-rise" style={{ position: 'absolute', top: offset, left: 0, right: 0, animationDuration: dur }}>
        {[...items, ...items].map((c, i) => ActCard(c, i))}
      </div>
    </div>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.88 }}>
      {col(FEED_A, '40s', 'left', 0)}
      {col(FEED_B, '54s', 'right', -100)}
    </div>
  );
}

function Aurora() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      <div className="olo-aurora" style={{ position: 'absolute', top: '-22%', left: '-22%', width: '62vmax', height: '62vmax', borderRadius: '50%', background: 'rgba(37,99,235,.45)', filter: 'blur(110px)' }} />
      <div className="olo-aurora" style={{ position: 'absolute', bottom: '-25%', right: '-20%', width: '58vmax', height: '58vmax', borderRadius: '50%', background: 'rgba(16,185,129,.40)', filter: 'blur(110px)', animationDelay: '-7s' }} />
      <div className="olo-aurora" style={{ position: 'absolute', top: '28%', right: '-18%', width: '46vmax', height: '46vmax', borderRadius: '50%', background: 'rgba(34,211,238,.34)', filter: 'blur(110px)', animationDelay: '-13s' }} />
      <div className="olo-aurora" style={{ position: 'absolute', bottom: '8%', left: '-18%', width: '44vmax', height: '44vmax', borderRadius: '50%', background: 'rgba(99,102,241,.30)', filter: 'blur(110px)', animationDelay: '-18s' }} />
    </div>
  );
}

export default function LandingPage() {
  return (
    <main
      style={{
        position: 'relative', minHeight: '100vh', overflow: 'hidden', color: '#fff',
        background: 'radial-gradient(125% 95% at 50% 0%, #0b1c44 0%, #060f29 55%, #04081a 100%)',
      }}
    >
      {/* Scoped animations for this landing (olo-* — not used anywhere else) */}
      <style>{`
        @keyframes olo-aurora { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(6%,-4%) scale(1.1)} 66%{transform:translate(-5%,5%) scale(.95)} }
        @keyframes olo-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
        @keyframes olo-gradient { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes olo-rise { from{transform:translateY(0)} to{transform:translateY(-50%)} }
        @keyframes olo-pulse { 0%{box-shadow:0 0 0 0 rgba(52,211,153,.55)} 70%{box-shadow:0 0 0 7px rgba(52,211,153,0)} 100%{box-shadow:0 0 0 0 rgba(52,211,153,0)} }
        .olo-aurora { animation: olo-aurora 20s ease-in-out infinite; }
        .olo-float  { animation: olo-float 6s ease-in-out infinite; }
        .olo-rise   { animation: olo-rise linear infinite; }
        .olo-pulse-dot { animation: olo-pulse 2s ease-out infinite; }
        .olo-gradient-text {
          background: linear-gradient(110deg,#3b82f6,#22d3ee,#22c55e,#3b82f6);
          background-size: 250% 250%;
          -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
          animation: olo-gradient 6s ease infinite;
        }
        .olo-glow { position: relative; }
        .olo-glow::before {
          content:''; position:absolute; inset:-2px; border-radius:inherit;
          background:linear-gradient(110deg,#3b82f6,#22c55e,#22d3ee); filter:blur(14px); opacity:.5; z-index:-1;
        }
        @media (prefers-reduced-motion: reduce) {
          .olo-aurora, .olo-float, .olo-rise, .olo-pulse-dot, .olo-gradient-text { animation: none; }
        }
      `}</style>

      {/* Redirect already-logged-in users straight to the dashboard */}
      <AlreadyAuthed />

      <Aurora />
      <ActivityStream />

      {/* Readability scrim: dark center + anchored bottom */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(74% 52% at 50% 44%, rgba(4,8,26,.96) 30%, rgba(4,8,26,.7) 55%, transparent 84%), linear-gradient(to top, #04081a 5%, transparent 30%)',
      }} />

      {/* Content column — mobile-first, centered on larger screens */}
      <div style={{
        position: 'relative', zIndex: 2, minHeight: '100vh',
        maxWidth: 440, margin: '0 auto',
        display: 'flex', flexDirection: 'column', padding: '18px 22px 34px',
      }}>
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <img src="/logo.svg" alt="OlomiPay" width={30} height={30} className="olo-float" />
            <span style={{ fontSize: 16, fontWeight: 700 }}>OlomiPay</span>
          </div>
          <Link href="/auth/login" style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', padding: '8px 16px', borderRadius: 999, textDecoration: 'none' }}>
            Sign in
          </Link>
        </div>

        {/* Hero */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, borderRadius: 999, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.07)', padding: '7px 15px', fontSize: 12.5, color: '#e2e8f0' }}>
            <span className="olo-pulse-dot" style={{ width: 7, height: 7, borderRadius: 999, background: '#34d399', flexShrink: 0 }} />
            <span><b style={{ color: '#fff', fontWeight: 700 }}>$1.2M</b> moving today</span>
          </div>
          <h1 style={{ fontSize: 47, fontWeight: 800, lineHeight: 1.02, letterSpacing: '-0.035em', margin: '20px 0 0' }}>
            Send money<br />like you <span className="olo-gradient-text">chat</span>.
          </h1>
          <p style={{ fontSize: 15.5, color: 'rgba(203,213,225,.85)', maxWidth: 290, margin: '16px 0 0', lineHeight: 1.5 }}>
            Deposit, send and cash out in seconds — right inside the conversation.
          </p>
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <Link href="/auth/register" className="olo-glow" style={{ width: '100%', maxWidth: 340, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, border: 0, background: 'linear-gradient(to right,#3b82f6,#22c55e)', color: '#fff', fontSize: 16, fontWeight: 700, padding: '17px 30px', textDecoration: 'none' }}>
            Get started — it&apos;s free <ArrowRight size={18} strokeWidth={2.4} />
          </Link>
          <p style={{ fontSize: 12, color: 'rgba(148,163,184,.9)', margin: 0 }}>1% flat · settles in seconds · end-to-end encrypted</p>
        </div>
      </div>
    </main>
  );
}
