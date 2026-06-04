'use client';

/* ════════════════════════════════════════════════════════════════════════════
   Sign in — UI-kit dark skin, fully keypad-driven (no OS keyboard).
   The on-screen keypad fills the active field: phone first, then PIN.
   Real auth logic preserved (auth.login → setTokens → ?next redirect).
   ════════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, ArrowRight, Phone } from 'lucide-react';
import Keypad from '../../../components/Keypad';
import { auth, setTokens } from '../../../lib/api';

function fmtPhone(d: string): string {
  const a = d.slice(0, 3), b = d.slice(3, 6), c = d.slice(6, 9);
  return [a, b, c].filter(Boolean).join(' ');
}

export default function LoginPage() {
  const router = useRouter();
  const [digits,  setDigits]  = useState('');           // TZ local digits (max 9)
  const [pin,     setPin]     = useState('');
  const [target,  setTarget]  = useState<'phone' | 'pin'>('phone');
  const [loading, setLoading] = useState(false);

  const phoneFull = '+255' + digits;
  const ready = digits.length === 9 && pin.length === 6;

  function onDigit(d: string) {
    if (target === 'phone') {
      setDigits(prev => {
        if (prev.length >= 9) return prev;
        const next = prev + d;
        if (next.length === 9) setTarget('pin'); // auto-advance to PIN
        return next;
      });
    } else {
      setPin(prev => (prev.length < 6 ? prev + d : prev));
    }
  }
  function onBackspace() {
    if (target === 'pin') {
      setPin(prev => {
        if (prev.length === 0) { setTarget('phone'); return prev; }
        return prev.slice(0, -1);
      });
    } else {
      setDigits(prev => prev.slice(0, -1));
    }
  }

  async function handleLogin() {
    if (!ready) return;
    setLoading(true);
    try {
      const data = await auth.login(phoneFull, pin);
      setTokens(data.accessToken, data.refreshToken);
      toast.success('Welcome back!');
      const nextUrl = new URLSearchParams(window.location.search).get('next');
      router.push(nextUrl && nextUrl.startsWith('/') ? nextUrl : '/dashboard');
    } catch (err: any) {
      toast.error(err.message ?? 'Login failed');
      setPin(''); setTarget('pin');
    } finally {
      setLoading(false);
    }
  }

  const phoneActive = target === 'phone';
  const pinActive   = target === 'pin';

  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflowY: 'auto', background: '#060b18', color: '#fff' }}>
      <style>{`
        @keyframes lp-aurora { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(6%,-4%) scale(1.1)} 66%{transform:translate(-5%,5%) scale(.95)} }
        @keyframes lp-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        @keyframes lp-glow   { 0%,100%{opacity:.5;transform:scale(1)} 50%{opacity:.85;transform:scale(1.06)} }
        @keyframes lp-caret  { 0%,100%{opacity:1} 50%{opacity:0} }
        .lp-aurora { animation: lp-aurora 20s ease-in-out infinite; }
        .lp-float  { animation: lp-float 6s ease-in-out infinite; }
        .lp-glowring { animation: lp-glow 5s ease-in-out infinite; }
        .lp-caret { animation: lp-caret 1s step-end infinite; }
        @media (prefers-reduced-motion: reduce){ .lp-aurora,.lp-float,.lp-glowring,.lp-caret{animation:none} }
      `}</style>

      {/* Aurora */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div className="lp-aurora" style={{ position: 'absolute', top: '-22%', left: '-22%', width: '60vmax', height: '60vmax', borderRadius: '50%', background: 'rgba(37,99,235,.40)', filter: 'blur(110px)' }} />
        <div className="lp-aurora" style={{ position: 'absolute', bottom: '-25%', right: '-20%', width: '55vmax', height: '55vmax', borderRadius: '50%', background: 'rgba(16,185,129,.34)', filter: 'blur(110px)', animationDelay: '-7s' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '44px 22px' }}>
        <Link href="/" style={{ position: 'absolute', left: 16, top: 18, color: '#94a3b8' }}>
          <ArrowLeft size={22} />
        </Link>

        <div style={{ width: '100%', maxWidth: 340 }}>
          {/* Logo + heading */}
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: 14 }}>
              <div className="lp-glowring" style={{ position: 'absolute', inset: -10, borderRadius: 24, background: 'linear-gradient(to top right,rgba(59,130,246,.5),rgba(16,185,129,.5))', filter: 'blur(22px)' }} />
              <div className="lp-float" style={{ position: 'relative', width: 60, height: 60, borderRadius: 22, background: 'linear-gradient(to bottom right,#3b82f6,#22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 18px 40px -10px rgba(34,197,94,.5)' }}>
                <img src="/logo.svg" alt="" width={34} height={34} style={{ filter: 'brightness(0) invert(1)' }} />
              </div>
            </div>
            <h1 style={{ fontSize: 25, fontWeight: 700, margin: 0 }}>Welcome back</h1>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>Sign in to keep the conversation going</p>
          </div>

          {/* Glass form */}
          <div style={{ borderRadius: 24, padding: 18, background: 'rgba(255,255,255,.06)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,.12)' }}>
            {/* Phone — tap to make it the keypad target */}
            <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 6 }}>Phone number</label>
            <button type="button" onClick={() => setTarget('phone')}
              style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, borderRadius: 16, border: `1.5px solid ${phoneActive ? 'rgba(59,130,246,.7)' : 'rgba(255,255,255,.1)'}`, background: 'rgba(255,255,255,.05)', padding: '13px 14px', marginBottom: 14, cursor: 'pointer' }}>
              <Phone size={17} style={{ color: phoneActive ? '#60a5fa' : '#64748b' }} />
              <span style={{ color: '#94a3b8', fontSize: 16 }}>+255</span>
              <span style={{ flex: 1, color: '#fff', fontSize: 16, letterSpacing: '.02em' }}>
                {digits ? fmtPhone(digits) : <span style={{ color: '#475569' }}>7XX XXX XXX</span>}
                {phoneActive && <span className="lp-caret" style={{ color: '#60a5fa' }}>|</span>}
              </span>
            </button>

            {/* PIN — tap to make it the keypad target */}
            <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 10 }}>Your PIN</label>
            <button type="button" onClick={() => setTarget('pin')}
              style={{ width: '100%', border: 0, background: 'none', padding: 0, marginBottom: 14, cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: 10 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ width: 38, height: 46, borderRadius: 14, border: `2px solid ${i < pin.length ? '#3b82f6' : pinActive ? 'rgba(59,130,246,.4)' : 'rgba(255,255,255,.1)'}`, background: 'rgba(255,255,255,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: '#fff' }}>
                  {i < pin.length ? '•' : ''}
                </div>
              ))}
            </button>

            <button onClick={handleLogin} disabled={!ready || loading}
              style={{ width: '100%', borderRadius: 16, border: 0, background: 'linear-gradient(to right,#3b82f6,#22c55e)', color: '#fff', fontSize: 15, fontWeight: 600, padding: '14px 0', cursor: ready ? 'pointer' : 'not-allowed', opacity: ready && !loading ? 1 : 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {loading ? 'Signing in…' : <>Sign in <ArrowRight size={17} strokeWidth={2.2} /></>}
            </button>
          </div>

          {/* In-app numeric keypad — fills the active field */}
          <div style={{ marginTop: 14 }}>
            <Keypad onDigit={onDigit} onBackspace={onBackspace} />
          </div>

          <p style={{ textAlign: 'center', fontSize: 13, color: '#94a3b8', marginTop: 16 }}>
            New to OlomiPay?{' '}
            <Link href="/auth/register" style={{ fontWeight: 600, background: 'linear-gradient(to right,#60a5fa,#34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
