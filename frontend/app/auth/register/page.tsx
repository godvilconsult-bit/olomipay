'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, Phone, User } from 'lucide-react';
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
    if (!/^\+\d{10,15}$/.test(phone)) {
      toast.error('Enter a valid phone number, e.g. +255712345678');
      return false;
    }
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
      router.push('/dashboard'); // always go to dashboard after new registration
    } catch (err: any) {
      toast.error(err.message ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const steps: Step[] = ['phone', 'name', 'pin', 'confirm'];
  const stepIndex = steps.indexOf(step);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 flex flex-col">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <button onClick={() => stepIndex > 0 ? setStep(steps[stepIndex - 1]) : router.push('/')}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">Create account</h1>
      </div>

      <div className="flex-1 flex flex-col px-5 py-8 max-w-md mx-auto w-full gap-8">
        {/* Progress bar */}
        <div className="flex gap-1.5">
          {steps.map((s, i) => (
            <div key={s} className={`flex-1 h-1.5 rounded-full transition-all ${i <= stepIndex ? 'bg-primary' : 'bg-slate-100 dark:bg-slate-800'}`} />
          ))}
        </div>

        {/* Step 1: Phone */}
        {step === 'phone' && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-2xl font-bold mb-1">Your phone number</h2>
              <p className="text-slate-500 text-sm">We'll link your Mobile Money to this number</p>
            </div>
            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 min-h-[56px]">
              <Phone size={18} className="text-slate-400 flex-shrink-0" />
              <input type="tel" placeholder="+255 7XX XXX XXX" value={phone}
                onChange={e => handlePhoneChange(e.target.value)}
                className="flex-1 bg-transparent text-base outline-none py-3"
                autoFocus autoComplete="tel" />
            </div>
            <button onClick={() => { if (validatePhone()) setStep('name'); }} className="btn-primary w-full text-base">
              Continue
            </button>
            <p className="text-center text-sm text-slate-500">
              Already have an account?{' '}
              <Link href="/auth/login" className="text-primary font-semibold">Sign in</Link>
            </p>
          </div>
        )}

        {/* Step 2: Name */}
        {step === 'name' && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-2xl font-bold mb-1">Your name</h2>
              <p className="text-slate-500 text-sm">This is how others will see you in chat</p>
            </div>
            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 min-h-[56px]">
              <User size={18} className="text-slate-400 flex-shrink-0" />
              <input type="text" placeholder="Your full name" value={name}
                onChange={e => setName(e.target.value)}
                className="flex-1 bg-transparent text-base outline-none py-3" autoFocus />
            </div>
            {name.length > 0 && (
              <div className="flex items-center gap-3 bg-primary/5 rounded-2xl p-4">
                <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-white text-xl font-bold">
                  {name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold">{name}</p>
                  <p className="text-xs text-slate-400">{phone}</p>
                </div>
              </div>
            )}
            <button onClick={() => setStep('pin')} disabled={name.length < 2} className="btn-primary w-full text-base">
              Continue
            </button>
            <button onClick={() => setStep('pin')} className="text-sm text-slate-400 text-center underline">
              Skip (add name later)
            </button>
          </div>
        )}

        {/* Step 3: PIN */}
        {step === 'pin' && (
          <div className="flex flex-col gap-6 items-center text-center">
            <div>
              <h2 className="text-2xl font-bold mb-1">Create your PIN</h2>
              <p className="text-slate-500 text-sm">6 digits — used to authorise every transfer</p>
            </div>
            <PinInput value={pin} onChange={setPin} autoFocus />
            <button onClick={() => { if (pin.length === 6) setStep('confirm'); }}
              disabled={pin.length < 6} className="btn-primary w-full text-base">
              Continue
            </button>
          </div>
        )}

        {/* Step 4: Confirm PIN */}
        {step === 'confirm' && (
          <div className="flex flex-col gap-6 items-center text-center">
            <div>
              <h2 className="text-2xl font-bold mb-1">Confirm your PIN</h2>
              <p className="text-slate-500 text-sm">Enter the same PIN again</p>
            </div>
            <PinInput value={confirm} onChange={setConfirm} autoFocus />
            {confirm.length === 6 && confirm !== pin && (
              <p className="text-danger text-sm -mt-4">PINs don't match</p>
            )}
            <button onClick={handleSubmit}
              disabled={confirm.length < 6 || loading || confirm !== pin}
              className="btn-primary w-full text-base">
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
