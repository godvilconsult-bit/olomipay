'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, Phone, User, ArrowRight, Sparkles, MessageCircle, TrendingUp, Globe2 } from 'lucide-react';
import PinInput from '../../../components/PinInput';
import { auth, setTokens } from '../../../lib/api';

type Step = 'phone' | 'name' | 'pin' | 'confirm';

export default function RegisterPage() {
  const router = useRouter();
  const [step,    setStep]    = useState<Step>('phone');
  const [phone,   setPhone]   = useState('');
  const [name,    setName]    = useState('');
  const [pin,     setPin]     = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  function handlePhoneChange(raw: string) {
    let val = raw.trim();
    if (val.startsWith('0') && val.length > 1) val = '+255' + val.slice(1);
    if (!val.startsWith('+') && val.length > 0) val = '+255' + val;
    setPhone(val);
  }
  function validatePhone() {
    if (!/^\+\d{10,15}$/.test(phone)) { toast.error('Enter a valid phone number, e.g. +255712345678'); return false; }
    return true;
  }

  async function handleSubmit() {
    if (pin !== confirm) { toast.error('PINs do not match'); return; }
    if (pin.length !== 6) { toast.error('PIN must be 6 digits'); return; }
    setLoading(true);
    try {
      const data = await auth.register(phone, pin, name);
      setTokens(data.accessToken, data.refreshToken);
      toast.success(`Welcome to OlomiPay, ${name || 'friend'}! 🎉`);
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err.message ?? 'Registration failed. Please try again.');
    } finally { setLoading(false); }
  }

  const steps: Step[] = ['phone', 'name', 'pin', 'confirm'];
  const stepIndex = steps.indexOf(step);
  const titles = ['Your number', 'Your name', 'Secure it', 'Confirm PIN'];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#060b18] text-white lg:grid lg:grid-cols-2">

      {/* Aurora background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="anim-aurora absolute -top-1/4 -right-1/4 h-[55vmax] w-[55vmax] rounded-full bg-emerald-500/25 blur-[120px]" />
        <div className="anim-aurora absolute bottom-0 -left-1/4 h-[50vmax] w-[50vmax] rounded-full bg-blue-600/30 blur-[120px]" style={{ animationDelay: '-8s' }} />
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      </div>

      {/* ── Left brand panel (desktop) ── */}
      <div className="relative hidden flex-col justify-between p-12 lg:flex">
        <Link href="/" className="hero-rise hd1 flex items-center gap-2.5 w-fit">
          <img src="/logo.svg" alt="OlomiPay" className="h-9 w-9 anim-float" />
          <span className="text-lg font-bold">OlomiPay</span>
        </Link>

        <div className="hero-rise hd2 max-w-md">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs">
            <Sparkles size={13} className="text-cyan-300" /> 60 seconds to join
          </div>
          <h2 className="text-4xl font-extrabold leading-tight">
            Join the wallet<br />that <span className="text-gradient-anim">talks back</span>.
          </h2>
          <p className="mt-4 text-slate-400">
            One account for chatting, paying, saving and earning — across every mobile money and bank in Africa.
          </p>
          <div className="mt-8 space-y-3">
            {[
              { icon: MessageCircle, t: 'Send money inside a chat' },
              { icon: TrendingUp,    t: 'Earn interest as you hold' },
              { icon: Globe2,        t: 'Pan-African, instant, on-chain' },
            ].map(f => (
              <div key={f.t} className="flex items-center gap-3 text-slate-300">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                  <f.icon size={16} className="text-emerald-300" />
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
        <button onClick={() => stepIndex > 0 ? setStep(steps[stepIndex - 1]) : router.push('/')}
          className="absolute left-4 top-5 flex items-center gap-2 text-slate-400">
          <ArrowLeft size={20} />
        </button>

        <div className="w-full max-w-sm">
          {/* Logo + step heading */}
          <div className="mb-7 flex flex-col items-center text-center hero-rise hd2">
            <div className="relative mb-5">
              <div className="anim-glow absolute -inset-4 rounded-full bg-gradient-to-tr from-emerald-500/50 to-blue-500/50 blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500 to-blue-500 shadow-2xl anim-float">
                <img src="/logo.svg" alt="" className="h-9 w-9 brightness-0 invert" />
              </div>
            </div>
            <h1 className="text-2xl font-bold">{titles[stepIndex]}</h1>
            <p className="mt-1 text-sm text-slate-400">Step {stepIndex + 1} of 4</p>
          </div>

          {/* Progress segments */}
          <div className="mb-6 flex gap-1.5">
            {steps.map((s, i) => (
              <div key={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full bg-gradient-to-r from-blue-400 to-emerald-400 transition-all duration-500 ${i <= stepIndex ? 'w-full' : 'w-0'}`} />
              </div>
            ))}
          </div>

          {/* Glass card */}
          <div key={step} className="glass anim-pop rounded-3xl p-6">
            {/* Step: phone */}
            {step === 'phone' && (
              <div className="space-y-5">
                <p className="text-sm text-slate-400">We'll link your Mobile Money to this number.</p>
                <div className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 transition-colors focus-within:border-blue-400/60 focus-within:bg-white/[0.08]">
                  <Phone size={18} className="text-slate-500 group-focus-within:text-blue-400" />
                  <input type="tel" placeholder="+255 7XX XXX XXX" value={phone}
                    onChange={e => handlePhoneChange(e.target.value)}
                    className="flex-1 bg-transparent py-3.5 text-base outline-none placeholder:text-slate-600" autoFocus autoComplete="tel" />
                </div>
                <NextBtn onClick={() => { if (validatePhone()) setStep('name'); }} label="Continue" />
              </div>
            )}

            {/* Step: name */}
            {step === 'name' && (
              <div className="space-y-5">
                <p className="text-sm text-slate-400">This is how friends will see you in chat.</p>
                <div className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 transition-colors focus-within:border-emerald-400/60 focus-within:bg-white/[0.08]">
                  <User size={18} className="text-slate-500 group-focus-within:text-emerald-400" />
                  <input type="text" placeholder="Your full name" value={name}
                    onChange={e => setName(e.target.value)}
                    className="flex-1 bg-transparent py-3.5 text-base outline-none placeholder:text-slate-600" autoFocus />
                </div>
                {name.length > 0 && (
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 anim-pop">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 text-lg font-bold">
                      {name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold">{name}</p>
                      <p className="text-xs text-slate-500">{phone}</p>
                    </div>
                  </div>
                )}
                <NextBtn onClick={() => setStep('pin')} disabled={name.length < 2} label="Continue" />
                <button onClick={() => setStep('pin')} className="w-full text-center text-sm text-slate-500 underline">Skip for now</button>
              </div>
            )}

            {/* Step: pin */}
            {step === 'pin' && (
              <div className="flex flex-col items-center gap-5">
                <p className="text-sm text-slate-400 text-center">Create a 6-digit PIN — it authorises every transfer.</p>
                <div className="[&_input]:!bg-white/5 [&_input]:!border-white/10 [&_input]:!text-white">
                  <PinInput value={pin} onChange={setPin} autoFocus />
                </div>
                <NextBtn onClick={() => { if (pin.length === 6) setStep('confirm'); }} disabled={pin.length < 6} label="Continue" />
              </div>
            )}

            {/* Step: confirm */}
            {step === 'confirm' && (
              <div className="flex flex-col items-center gap-5">
                <p className="text-sm text-slate-400 text-center">Enter your PIN again to confirm.</p>
                <div className="[&_input]:!bg-white/5 [&_input]:!border-white/10 [&_input]:!text-white">
                  <PinInput value={confirm} onChange={setConfirm} autoFocus />
                </div>
                {confirm.length === 6 && confirm !== pin && (
                  <p className="-mt-2 text-sm text-red-400">PINs don't match</p>
                )}
                <button onClick={handleSubmit} disabled={confirm.length < 6 || loading || confirm !== pin}
                  className="cta-glow flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-blue-500 py-4 text-base font-semibold shadow-xl transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100">
                  {loading ? 'Creating your account…' : <>Create account <ArrowRight size={18} /></>}
                </button>
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-sm text-slate-400">
            Already have an account?{' '}
            <Link href="/auth/login" className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function NextBtn({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="cta-glow group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-emerald-500 py-4 text-base font-semibold shadow-xl transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100">
      {label} <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
    </button>
  );
}
