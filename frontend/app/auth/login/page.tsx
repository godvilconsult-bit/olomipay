'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, Phone, ArrowRight, MessageCircle, Zap, ShieldCheck } from 'lucide-react';
import PinInput from '../../../components/PinInput';
import { auth, setTokens } from '../../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [phone,   setPhone]   = useState('');
  const [pin,     setPin]     = useState('');
  const [loading, setLoading] = useState(false);

  function handlePhoneChange(raw: string) {
    let val = raw.trim();
    if (val.startsWith('0') && val.length > 1) val = '+255' + val.slice(1);
    if (!val.startsWith('+') && val.length > 0) val = '+255' + val;
    setPhone(val);
  }

  async function handleLogin() {
    if (!/^\+\d{10,15}$/.test(phone)) { toast.error('Enter a valid phone number'); return; }
    if (pin.length !== 6) { toast.error('Enter your 6-digit PIN'); return; }
    setLoading(true);
    try {
      const data = await auth.login(phone, pin);
      setTokens(data.accessToken, data.refreshToken);
      toast.success('Welcome back!');
      const nextUrl = new URLSearchParams(window.location.search).get('next');
      router.push(nextUrl && nextUrl.startsWith('/') ? nextUrl : '/dashboard');
    } catch (err: any) {
      toast.error(err.message ?? 'Login failed');
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#060b18] text-white lg:grid lg:grid-cols-2">

      {/* Aurora background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="anim-aurora absolute -top-1/4 -left-1/4 h-[55vmax] w-[55vmax] rounded-full bg-blue-600/30 blur-[120px]" />
        <div className="anim-aurora absolute bottom-0 -right-1/4 h-[50vmax] w-[50vmax] rounded-full bg-emerald-500/25 blur-[120px]" style={{ animationDelay: '-8s' }} />
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      </div>

      {/* ── Left brand panel (desktop only) ── */}
      <div className="relative hidden flex-col justify-between p-12 lg:flex">
        <Link href="/" className="hero-rise hd1 flex items-center gap-2.5 w-fit">
          <img src="/logo.svg" alt="OlomiPay" className="h-9 w-9 anim-float" />
          <span className="text-lg font-bold">OlomiPay</span>
        </Link>

        <div className="hero-rise hd2 max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight">
            Your money,<br />your <span className="text-gradient-anim">conversation</span>.
          </h2>
          <p className="mt-4 text-slate-400">
            Pick up right where you left off — chats, payments, and savings, all settled on-chain in seconds.
          </p>
          <div className="mt-8 space-y-3">
            {[
              { icon: MessageCircle, t: 'Encrypted chat + pay' },
              { icon: Zap,           t: 'Settles in seconds, 24/7' },
              { icon: ShieldCheck,   t: 'Verifiable on-chain' },
            ].map(f => (
              <div key={f.t} className="flex items-center gap-3 text-slate-300">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 border border-white/10">
                  <f.icon size={16} className="text-cyan-300" />
                </div>
                <span className="text-sm">{f.t}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="hero-rise hd3 text-xs text-slate-600">© 2026 OlomiPay · Building Trust Through Blockchain</p>
      </div>

      {/* ── Right form panel ── */}
      <div className="relative flex min-h-screen flex-col items-center justify-center px-5 py-10 lg:min-h-0">
        {/* Mobile back + logo */}
        <Link href="/" className="absolute left-4 top-5 flex items-center gap-2 text-slate-400 lg:hidden">
          <ArrowLeft size={20} />
        </Link>

        <div className="hero-rise hd2 w-full max-w-sm">
          {/* Glowing logo */}
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="relative mb-5">
              <div className="anim-glow absolute -inset-4 rounded-full bg-gradient-to-tr from-blue-500/50 to-emerald-500/50 blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-emerald-500 shadow-2xl anim-float">
                <img src="/logo.svg" alt="" className="h-9 w-9 brightness-0 invert" />
              </div>
            </div>
            <h1 className="text-3xl font-bold">Welcome back</h1>
            <p className="mt-1.5 text-sm text-slate-400">Sign in to keep the conversation going</p>
          </div>

          {/* Glass form */}
          <div className="glass rounded-3xl p-6 space-y-5">
            {/* Phone */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Phone number</label>
              <div className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 transition-colors focus-within:border-blue-400/60 focus-within:bg-white/[0.08]">
                <Phone size={18} className="text-slate-500 transition-colors group-focus-within:text-blue-400" />
                <input type="tel" placeholder="+255 7XX XXX XXX" value={phone}
                  onChange={e => handlePhoneChange(e.target.value)}
                  className="flex-1 bg-transparent py-3.5 text-base text-white outline-none placeholder:text-slate-600"
                  autoFocus autoComplete="tel" />
              </div>
            </div>

            {/* PIN */}
            <div>
              <label className="mb-2.5 block text-xs font-medium text-slate-400">Your PIN</label>
              <div className="flex justify-center [&_input]:!bg-white/5 [&_input]:!border-white/10 [&_input]:!text-white">
                <PinInput value={pin} onChange={setPin} />
              </div>
            </div>

            <button onClick={handleLogin} disabled={loading || pin.length < 6 || phone.length < 11}
              className="cta-glow group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-emerald-500 py-4 text-base font-semibold shadow-xl transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100">
              {loading ? 'Signing in…' : <>Sign in <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" /></>}
            </button>
          </div>

          {/* Recover wallet — front-and-centre trust promise */}
          <Link href="/auth/recover"
            className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10">
            <ShieldCheck size={16} className="text-emerald-400" />
            Lost your phone? Recover your wallet
          </Link>

          <p className="mt-6 text-center text-sm text-slate-400">
            New to OlomiPay?{' '}
            <Link href="/auth/register" className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
