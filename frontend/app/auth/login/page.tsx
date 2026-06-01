'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, Phone } from 'lucide-react';
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
    if (!/^\+255\d{9}$/.test(phone)) { toast.error('Invalid phone number'); return; }
    if (pin.length !== 6) { toast.error('Enter your 6-digit PIN'); return; }
    setLoading(true);
    try {
      const data = await auth.login(phone, pin);
      setTokens(data.accessToken, data.refreshToken);
      toast.success('Welcome back!');
      // Redirect to originally-requested page if middleware stored it in ?next=
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col">
      <div className="flex items-center gap-3 px-5 py-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
        <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-lg font-semibold">Sign in</h1>
      </div>

      <div className="flex-1 flex flex-col px-5 py-8 max-w-md mx-auto w-full gap-8">
        {/* Brand */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-3xl bg-primary flex items-center justify-center">
            <span className="text-white font-bold text-2xl">O</span>
          </div>
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-bold mb-1">Welcome back</h2>
          <p className="text-slate-500 text-sm">Sign in to your OlomiPay account</p>
        </div>

        {/* Phone */}
        <div className="flex flex-col gap-4">
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

          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-slate-500 self-start">Enter your PIN</p>
            <PinInput value={pin} onChange={setPin} />
          </div>
        </div>

        <button
          onClick={handleLogin}
          disabled={loading || pin.length < 6 || phone.length < 13}
          className="btn-primary w-full text-base"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-center text-sm text-slate-500">
          Don't have an account?{' '}
          <Link href="/auth/register" className="text-primary font-medium">Create one</Link>
        </p>
      </div>
    </div>
  );
}
