'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, Phone } from 'lucide-react';
import PinInput from '../../../components/PinInput';
import { auth, setTokens } from '../../../lib/api';

type Step = 'phone' | 'pin' | 'confirm';

export default function RegisterPage() {
  const router = useRouter();
  const [step,    setStep]    = useState<Step>('phone');
  const [phone,   setPhone]   = useState('');
  const [pin,     setPin]     = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  // Normalise +255 prefix
  function handlePhoneChange(raw: string) {
    let val = raw.trim();
    if (val.startsWith('0') && val.length > 1) val = '+255' + val.slice(1);
    if (!val.startsWith('+255') && val.length > 0 && !val.startsWith('+')) val = '+255' + val;
    setPhone(val);
  }

  function validatePhone() {
    if (!/^\+255\d{9}$/.test(phone)) {
      toast.error('Enter a valid Tanzania number: +255XXXXXXXXX');
      return false;
    }
    return true;
  }

  async function handleSubmit() {
    if (pin !== confirm) { toast.error('PINs do not match'); return; }
    if (pin.length !== 6) { toast.error('PIN must be 6 digits'); return; }
    setLoading(true);
    try {
      const data = await auth.register(phone, pin);
      setTokens(data.accessToken, data.refreshToken);
      toast.success('Account created! Welcome to OlomiPay 🎉');
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err.message ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
        <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-lg font-semibold">Create account</h1>
      </div>

      <div className="flex-1 flex flex-col px-5 py-8 max-w-md mx-auto w-full gap-8">
        {/* Progress dots */}
        <div className="flex justify-center gap-2">
          {(['phone', 'pin', 'confirm'] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all duration-300 ${
                step === s ? 'w-8 bg-primary' : 'w-2 bg-slate-200 dark:bg-slate-700'
              }`}
            />
          ))}
        </div>

        {/* Step: phone */}
        {step === 'phone' && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-2xl font-bold mb-1">Your phone number</h2>
              <p className="text-slate-500 text-sm">We'll link your M-Pesa to this number</p>
            </div>

            <div className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 min-h-[56px]">
              <Phone size={18} className="text-slate-400 flex-shrink-0" />
              <input
                type="tel"
                placeholder="+255 7XX XXX XXX"
                value={phone}
                onChange={e => handlePhoneChange(e.target.value)}
                className="flex-1 bg-transparent text-base outline-none py-3"
                autoFocus
                autoComplete="tel"
              />
            </div>

            <button
              onClick={() => { if (validatePhone()) setStep('pin'); }}
              className="btn-primary w-full text-base"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step: pin */}
        {step === 'pin' && (
          <div className="flex flex-col gap-6 items-center text-center">
            <div>
              <h2 className="text-2xl font-bold mb-1">Create your PIN</h2>
              <p className="text-slate-500 text-sm">6 digits — used to authorise every transfer</p>
            </div>

            <PinInput value={pin} onChange={setPin} autoFocus />

            <button
              onClick={() => { if (pin.length === 6) setStep('confirm'); }}
              disabled={pin.length < 6}
              className="btn-primary w-full text-base"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step: confirm pin */}
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

            <button
              onClick={handleSubmit}
              disabled={confirm.length < 6 || loading}
              className="btn-primary w-full text-base"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </div>
        )}

        <p className="text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-primary font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
