'use client';

/* ════════════════════════════════════════════════════════════════════════════
   Create account — UI-kit dark skin + in-app numeric keypad on PIN steps.
   4-step flow (phone → name → PIN → confirm) and auth.register preserved.
   ════════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, ArrowRight, Phone, User } from 'lucide-react';
import Keypad from '../../../components/Keypad';
import { auth, setTokens } from '../../../lib/api';

type Step = 'phone' | 'name' | 'pin' | 'confirm';

function fmtPhone(d: string): string {
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join(' ');
}

function PinBoxes({ value }: { value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ width: 38, height: 46, borderRadius: 14, border: `2px solid ${i < value.length ? '#3b82f6' : 'rgba(255,255,255,.1)'}`, background: 'rgba(255,255,255,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: '#fff' }}>
          {i < value.length ? '•' : ''}
        </div>
      ))}
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [step,    setStep]    = useState<Step>('phone');
  const [digits,  setDigits]  = useState('');           // TZ local digits (max 9)
  const [name,    setName]    = useState('');
  const [pin,     setPin]     = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const steps: Step[] = ['phone', 'name', 'pin', 'confirm'];
  const stepIndex = steps.indexOf(step);
  const titles = ['Your number', 'Your name', 'Secure it', 'Confirm PIN'];

  const phoneFull  = '+255' + digits;
  const phoneValid = digits.length === 9;

  // Physical keyboard support (desktop without touchscreen).
  // 'name' step uses a real text input, so we let the browser handle it there.
  useEffect(() => {
    if (step === 'name') return;
    function onKey(e: KeyboardEvent) {
      const digit = /^[0-9]$/.test(e.key);
      if (step === 'phone') {
        if (digit)                      { e.preventDefault(); setDigits(p => (p.length < 9 ? p + e.key : p)); }
        else if (e.key === 'Backspace') { e.preventDefault(); setDigits(p => p.slice(0, -1)); }
        else if (e.key === 'Enter' && phoneValid) { e.preventDefault(); setStep('name'); }
      } else if (step === 'pin') {
        if (digit)                      { e.preventDefault(); setPin(p => (p.length < 6 ? p + e.key : p)); }
        else if (e.key === 'Backspace') { e.preventDefault(); setPin(p => p.slice(0, -1)); }
        else if (e.key === 'Enter' && pin.length === 6) { e.preventDefault(); setStep('confirm'); }
      } else if (step === 'confirm') {
        if (digit)                      { e.preventDefault(); setConfirm(c => (c.length < 6 ? c + e.key : c)); }
        else if (e.key === 'Backspace') { e.preventDefault(); setConfirm(c => c.slice(0, -1)); }
        else if (e.key === 'Enter')     { e.preventDefault(); handleSubmit(); }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function handleSubmit() {
    if (pin !== confirm) { toast.error('PINs do not match'); return; }
    if (pin.length !== 6) { toast.error('PIN must be 6 digits'); return; }
    setLoading(true);
    try {
      const data = await auth.register(phoneFull, pin, name);
      setTokens(data.accessToken, data.refreshToken);
      toast.success(`Welcome to OlomiPay, ${name || 'friend'}! 🎉`);
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err.message ?? 'Registration failed. Please try again.');
    } finally { setLoading(false); }
  }

  const gradBtn: React.CSSProperties = {
    width: '100%', borderRadius: 16, border: 0, background: 'linear-gradient(to right,#3b82f6,#22c55e)',
    color: '#fff', fontSize: 15, fontWeight: 600, padding: '14px 0',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  };
  const field: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, borderRadius: 16,
    border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.05)', padding: '0 14px',
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflowY: 'auto', background: '#060b18', color: '#fff' }}>
      <style>{`
        @keyframes rp-aurora { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(6%,-4%) scale(1.1)} 66%{transform:translate(-5%,5%) scale(.95)} }
        @keyframes rp-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        @keyframes rp-glow   { 0%,100%{opacity:.5;transform:scale(1)} 50%{opacity:.85;transform:scale(1.06)} }
        .rp-aurora { animation: rp-aurora 20s ease-in-out infinite; }
        .rp-float  { animation: rp-float 6s ease-in-out infinite; }
        .rp-glowring { animation: rp-glow 5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce){ .rp-aurora,.rp-float,.rp-glowring{animation:none} }
      `}</style>

      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div className="rp-aurora" style={{ position: 'absolute', top: '-22%', right: '-22%', width: '60vmax', height: '60vmax', borderRadius: '50%', background: 'rgba(16,185,129,.34)', filter: 'blur(110px)' }} />
        <div className="rp-aurora" style={{ position: 'absolute', bottom: '-25%', left: '-20%', width: '55vmax', height: '55vmax', borderRadius: '50%', background: 'rgba(37,99,235,.40)', filter: 'blur(110px)', animationDelay: '-7s' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '44px 22px' }}>
        <button onClick={() => stepIndex > 0 ? setStep(steps[stepIndex - 1]) : router.push('/')}
          style={{ position: 'absolute', left: 16, top: 18, background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer' }}>
          <ArrowLeft size={22} />
        </button>

        <div style={{ width: '100%', maxWidth: 340 }}>
          {/* Logo + heading */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
              <div className="rp-glowring" style={{ position: 'absolute', inset: -10, borderRadius: 24, background: 'linear-gradient(to top right,rgba(16,185,129,.5),rgba(59,130,246,.5))', filter: 'blur(22px)' }} />
              <div className="rp-float" style={{ position: 'relative', width: 64, height: 64, borderRadius: 22, background: 'linear-gradient(to bottom right,#22c55e,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 18px 40px -10px rgba(34,197,94,.5)' }}>
                <img src="/logo.svg" alt="" width={36} height={36} style={{ filter: 'brightness(0) invert(1)' }} />
              </div>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{titles[stepIndex]}</h1>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>Step {stepIndex + 1} of 4</p>
          </div>

          {/* Progress segments */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
            {steps.map((s, i) => (
              <div key={s} style={{ height: 6, flex: 1, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,.1)' }}>
                <div style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(to right,#60a5fa,#34d399)', width: i <= stepIndex ? '100%' : 0, transition: 'width .5s' }} />
              </div>
            ))}
          </div>

          {/* Glass card */}
          <div style={{ borderRadius: 24, padding: 20, background: 'rgba(255,255,255,.06)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,.12)' }}>
            {step === 'phone' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>We&apos;ll link your Mobile Money to this number.</p>
                <div style={field}>
                  <Phone size={18} style={{ color: '#60a5fa' }} />
                  <span style={{ color: '#94a3b8', fontSize: 16 }}>+255</span>
                  <span style={{ flex: 1, color: '#fff', fontSize: 16, padding: '13px 0', letterSpacing: '.02em' }}>
                    {digits ? fmtPhone(digits) : <span style={{ color: '#475569' }}>7XX XXX XXX</span>}
                  </span>
                </div>
                <Keypad
                  onDigit={d => setDigits(p => (p.length < 9 ? p + d : p))}
                  onBackspace={() => setDigits(p => p.slice(0, -1))}
                />
                <button onClick={() => phoneValid ? setStep('name') : toast.error('Enter your 9-digit number')} style={{ ...gradBtn, opacity: phoneValid ? 1 : 0.4, cursor: phoneValid ? 'pointer' : 'not-allowed' }}>
                  Continue <ArrowRight size={17} strokeWidth={2.2} />
                </button>
              </div>
            )}

            {step === 'name' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>This is how friends will see you in chat.</p>
                <div style={field}>
                  <User size={18} style={{ color: '#34d399' }} />
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" autoFocus
                    style={{ flex: 1, background: 'transparent', border: 0, outline: 0, color: '#fff', fontSize: 16, padding: '13px 0' }} />
                </div>
                <button onClick={() => name.trim().length >= 2 ? setStep('pin') : toast.error('Enter your name')} style={{ ...gradBtn, opacity: name.trim().length >= 2 ? 1 : 0.4 }}>
                  Continue <ArrowRight size={17} strokeWidth={2.2} />
                </button>
                <button onClick={() => setStep('pin')} style={{ background: 'none', border: 0, color: '#64748b', fontSize: 13, textDecoration: 'underline', cursor: 'pointer' }}>Skip for now</button>
              </div>
            )}

            {step === 'pin' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', margin: 0 }}>Create a 6-digit PIN — it authorises every transfer.</p>
                <PinBoxes value={pin} />
                <Keypad onDigit={d => setPin(p => (p.length < 6 ? p + d : p))} onBackspace={() => setPin(p => p.slice(0, -1))} />
                <button onClick={() => pin.length === 6 ? setStep('confirm') : null} style={{ ...gradBtn, opacity: pin.length === 6 ? 1 : 0.4 }}>
                  Continue <ArrowRight size={17} strokeWidth={2.2} />
                </button>
              </div>
            )}

            {step === 'confirm' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', margin: 0 }}>Enter your PIN again to confirm.</p>
                <PinBoxes value={confirm} />
                {confirm.length === 6 && confirm !== pin && (
                  <p style={{ color: '#f87171', fontSize: 13, textAlign: 'center', margin: 0 }}>PINs don&apos;t match</p>
                )}
                <Keypad onDigit={d => setConfirm(c => (c.length < 6 ? c + d : c))} onBackspace={() => setConfirm(c => c.slice(0, -1))} />
                <button onClick={handleSubmit} disabled={confirm.length < 6 || loading || confirm !== pin}
                  style={{ ...gradBtn, opacity: confirm.length === 6 && confirm === pin && !loading ? 1 : 0.4, cursor: confirm.length === 6 && confirm === pin && !loading ? 'pointer' : 'not-allowed' }}>
                  {loading ? 'Creating your account…' : <>Create account <ArrowRight size={17} strokeWidth={2.2} /></>}
                </button>
              </div>
            )}
          </div>

          <p style={{ textAlign: 'center', fontSize: 13, color: '#94a3b8', marginTop: 18 }}>
            Already have an account?{' '}
            <Link href="/auth/login" style={{ fontWeight: 600, background: 'linear-gradient(to right,#60a5fa,#34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
