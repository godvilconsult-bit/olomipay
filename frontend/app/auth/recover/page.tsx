'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, Phone, ShieldCheck, ArrowRight, CheckCircle2, Wallet, Loader2, Copy } from 'lucide-react';
import PinInput from '../../../components/PinInput';
import { auth, setTokens } from '../../../lib/api';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function RecoverPage() {
  const router = useRouter();
  const [phone,   setPhone]   = useState('');
  const [pin,     setPin]     = useState('');
  const [busy,    setBusy]    = useState(false);
  const [done,    setDone]    = useState<any>(null); // recovered wallet info

  function handlePhone(raw: string) {
    let v = raw.trim();
    if (v.startsWith('0') && v.length > 1) v = '+255' + v.slice(1);
    if (!v.startsWith('+') && v.length > 0) v = '+255' + v;
    setPhone(v);
  }

  async function recover() {
    if (!/^\+\d{10,15}$/.test(phone)) { toast.error('Enter a valid phone number'); return; }
    if (pin.length !== 6) { toast.error('Enter your 6-digit PIN'); return; }
    setBusy(true);
    try {
      // 1) Authenticate (phone + PIN) — this restores the session
      const data = await auth.login(phone, pin);
      setTokens(data.accessToken, data.refreshToken);

      // 2) Rebuild + activate the deterministic wallet (same address every time)
      const token = data.accessToken;
      const r = await fetch(`${API}/api/wallet/activate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ pin }),
      }).then(r => r.json());

      // 3) Read the recovered wallet + balance
      const w = await fetch(`${API}/api/swap/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json());

      setDone({
        address: w?.data?.address ?? r?.data?.address ?? '',
        balance: w?.data?.balance ?? r?.data?.balance ?? { usdc: '0', xlm: '0' },
      });
      toast.success('Wallet recovered!');
    } catch (err: any) {
      toast.error(err.message ?? 'Could not recover. Check your phone & PIN.');
      setPin('');
    } finally { setBusy(false); }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#060b18] text-white flex flex-col items-center justify-center px-5">
      {/* aurora */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="anim-aurora absolute -top-1/4 -left-1/4 h-[55vmax] w-[55vmax] rounded-full bg-emerald-600/25 blur-[120px]" />
        <div className="anim-aurora absolute bottom-0 -right-1/4 h-[50vmax] w-[50vmax] rounded-full bg-blue-600/25 blur-[120px]" style={{ animationDelay: '-8s' }} />
      </div>

      <Link href="/auth/login" className="absolute left-4 top-5 flex items-center gap-2 text-slate-400">
        <ArrowLeft size={20} />
      </Link>

      {/* ── Success state ── */}
      {done ? (
        <div className="w-full max-w-sm text-center anim-pop">
          <div className="relative mx-auto mb-5 w-16 h-16">
            <div className="anim-glow absolute -inset-4 rounded-full bg-emerald-500/40 blur-xl" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-500">
              <CheckCircle2 size={30} />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Wallet recovered 🎉</h1>
          <p className="mt-1.5 text-sm text-slate-400">Your wallet and balance are restored — same address, nothing lost.</p>

          <div className="glass mt-6 rounded-3xl p-5 text-left">
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-2xl bg-white/5 p-3 text-center">
                <p className="text-xs text-slate-400">USD</p>
                <p className="text-lg font-bold">${parseFloat(done.balance.usdc ?? '0').toFixed(2)}</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-3 text-center">
                <p className="text-xs text-slate-400">Coins</p>
                <p className="text-lg font-bold">{parseFloat(done.balance.xlm ?? '0').toFixed(2)}</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mb-1">Your wallet ID</p>
            <p className="font-mono text-xs text-slate-300 break-all">{done.address}</p>
            <button onClick={() => { navigator.clipboard.writeText(done.address); toast.success('Copied'); }}
              className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
              <Copy size={12} /> Copy
            </button>
          </div>

          <button onClick={() => router.push('/dashboard')}
            className="cta-glow mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-blue-500 py-4 font-semibold">
            Open my wallet <ArrowRight size={18} />
          </button>
        </div>
      ) : (
        /* ── Recover form ── */
        <div className="w-full max-w-sm hero-rise hd2">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="relative mb-5">
              <div className="anim-glow absolute -inset-4 rounded-full bg-gradient-to-tr from-emerald-500/50 to-blue-500/50 blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500 to-blue-500 shadow-2xl anim-float">
                <ShieldCheck size={28} />
              </div>
            </div>
            <h1 className="text-3xl font-bold">Recover your wallet</h1>
            <p className="mt-1.5 max-w-xs text-sm text-slate-400">
              New phone? No problem. Your wallet is tied to your number — just verify it to restore your balance.
            </p>
          </div>

          <div className="glass rounded-3xl p-6 space-y-5">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Your phone number</label>
              <div className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 transition-colors focus-within:border-emerald-400/60">
                <Phone size={18} className="text-slate-500 group-focus-within:text-emerald-400" />
                <input type="tel" value={phone} onChange={e => handlePhone(e.target.value)}
                  placeholder="+255 7XX XXX XXX" autoFocus autoComplete="tel"
                  className="flex-1 bg-transparent py-3.5 text-base outline-none placeholder:text-slate-600" />
              </div>
            </div>
            <div>
              <label className="mb-2.5 block text-xs font-medium text-slate-400">Your PIN</label>
              <div className="flex justify-center [&_input]:!bg-white/5 [&_input]:!border-white/10 [&_input]:!text-white">
                <PinInput value={pin} onChange={setPin} />
              </div>
            </div>
            <button onClick={recover} disabled={busy || pin.length < 6 || phone.length < 11}
              className="cta-glow flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-blue-500 py-4 text-base font-semibold disabled:opacity-40">
              {busy ? <><Loader2 size={18} className="animate-spin" /> Recovering…</> : <><Wallet size={18} /> Recover wallet</>}
            </button>
          </div>

          <p className="mt-5 text-center text-xs text-slate-500">
            🔒 Your wallet is cryptographically derived from your phone number — only you,
            with your PIN, can restore and use it.
          </p>
          <p className="mt-4 text-center text-sm text-slate-400">
            Remembered your device?{' '}
            <Link href="/auth/login" className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">Sign in</Link>
          </p>
        </div>
      )}
    </div>
  );
}
