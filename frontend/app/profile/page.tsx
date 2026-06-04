'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Copy, LogOut, Shield, Camera, Wallet, RefreshCw, Edit2, Check, Wrench, LifeBuoy, Briefcase, History } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import PinInput from '../../components/PinInput';
import { auth, clearTokens } from '../../lib/api';

const API = process.env.NEXT_PUBLIC_API_URL;

function getToken() {
  return sessionStorage.getItem('olomipay_at') || (sessionStorage.getItem('olomipay_at') || sessionStorage.getItem('olomipay_rt')) || '';
}

export default function ProfilePage() {
  const router   = useRouter();
  const fileRef  = useRef<HTMLInputElement>(null);

  const [user,        setUser]        = useState<any>(null);
  const [wallet,      setWallet]      = useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const [uploading,   setUploading]   = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName,     setNewName]     = useState('');
  const [showFix,     setShowFix]     = useState(false);
  const [fixPin,      setFixPin]      = useState('');
  const [fixing,      setFixing]      = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/profile/me`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()),
      fetch(`${API}/api/swap/wallet`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()),
    ]).then(([profileRes, walletRes]) => {
      if (profileRes.success) {
        setUser(profileRes.data.user);
        setNewName(profileRes.data.user.kycName ?? '');
        // Corrupt/legacy key → steer the user straight to the real fix (re-activate)
        if (profileRes.data.user.walletKeyValid === false) setShowFix(true);
      }
      else router.replace('/auth/login');
      if (walletRes.success) setWallet(walletRes.data);
      setLoading(false);
    }).catch(() => { router.replace('/auth/login'); });
  }, []);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10MB'); return; }

    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch(`${API}/api/profile/avatar`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body:    form,
      });
      const data = await res.json();
      if (data.success) {
        setUser((u: any) => ({ ...u, profilePicUrl: data.data.avatarUrl }));
        toast.success('Profile photo updated!');
      } else {
        toast.error(data.error ?? 'Upload failed');
      }
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function saveName() {
    if (newName.trim().length < 2) { toast.error('Name must be at least 2 characters'); return; }
    const res = await fetch(`${API}/api/profile/name`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body:    JSON.stringify({ name: newName.trim() }),
    }).then(r => r.json());
    if (res.success) { setUser((u: any) => ({ ...u, kycName: newName.trim() })); setEditingName(false); toast.success('Name updated!'); }
    else toast.error(res.error ?? 'Failed');
  }

  async function fundWallet() {
    if (!wallet?.address) return;
    toast.loading('Funding wallet from testnet...', { id: 'fund' });
    try {
      await fetch(`https://friendbot.stellar.org?addr=${wallet.address}`);
      toast.success('Wallet activated!', { id: 'fund' });
      // Refresh wallet
      const r = await fetch(`${API}/api/swap/wallet`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json());
      if (r.success) setWallet(r.data);
    } catch {
      toast.error('Funding failed', { id: 'fund' });
    }
  }

  // Recovery for a corrupt/legacy wallet key (the "invalid initialization vector" error)
  async function reactivateWallet() {
    if (fixPin.length < 6) { toast.error('Enter your 6-digit PIN'); return; }
    setFixing(true);
    try {
      const r = await fetch(`${API}/api/wallet/reprovision`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body:    JSON.stringify({ pin: fixPin }),
      }).then(r => r.json());
      if (r.success) {
        toast.success(r.data.message ?? 'Wallet re-activated!');
        setShowFix(false); setFixPin('');
        const w = await fetch(`${API}/api/swap/wallet`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json());
        if (w.success) setWallet(w.data);
      } else {
        toast.error(r.error ?? 'Could not re-activate');
      }
    } catch {
      toast.error('Re-activation failed');
    } finally { setFixing(false); }
  }

  function copyAddress() {
    if (!wallet?.address) return;
    navigator.clipboard.writeText(wallet.address);
    toast.success('Wallet address copied!');
  }

  async function handleLogout() {
    await auth.logout().catch(() => {});
    clearTokens();
    router.replace('/');
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const initials = (user?.kycName ?? user?.phone ?? '?').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-slate-100">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-semibold text-lg">Profile</h1>
      </div>

      <div className="max-w-md mx-auto px-4 pt-6 space-y-4">

        {/* ── Avatar + name ── */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 flex flex-col items-center gap-4">
          {/* Avatar */}
          <div className="relative">
            {user?.profilePicUrl ? (
              <img src={user.profilePicUrl} alt="Avatar"
                className="w-24 h-24 rounded-full object-cover border-4 border-primary/20" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-primary flex items-center justify-center text-white text-3xl font-bold border-4 border-primary/20">
                {initials}
              </div>
            )}
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="absolute bottom-0 right-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center shadow-md border-2 border-white">
              {uploading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Camera size={14} className="text-white" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>

          {/* Name */}
          {editingName ? (
            <div className="flex items-center gap-2 w-full">
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                className="flex-1 bg-slate-50 dark:bg-slate-700 rounded-xl px-3 py-2 text-sm outline-none border-2 border-primary"
                autoFocus onKeyDown={e => e.key === 'Enter' && saveName()} />
              <button onClick={saveName} className="p-2 bg-primary rounded-xl text-white">
                <Check size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="font-bold text-lg">{user?.kycName ?? 'No name set'}</p>
              <button onClick={() => setEditingName(true)} className="p-1 text-slate-400 hover:text-primary">
                <Edit2 size={14} />
              </button>
            </div>
          )}

          <p className="text-sm text-slate-400">{user?.phone}</p>

          <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
            user?.kycStatus === 'APPROVED' ? 'bg-green-100 text-green-700' :
            user?.kycStatus === 'SUBMITTED' ? 'bg-amber-100 text-amber-700' :
            'bg-slate-100 text-slate-500'
          }`}>
            {user?.kycStatus === 'APPROVED' ? '✓ Verified' :
             user?.kycStatus === 'SUBMITTED' ? 'Pending verification' : 'Not verified'}
          </div>
        </div>

        {/* ── Olomi Wallet ── */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={18} className="text-primary" />
            <h3 className="font-semibold">Olomi Wallet</h3>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Active</span>
          </div>

          {/* Balance — single USD money balance */}
          <div className="bg-slate-50 dark:bg-slate-700 rounded-2xl p-3 text-center">
            <p className="text-xs text-slate-400 mb-1">Balance</p>
            <p className="font-bold text-lg">${parseFloat(wallet?.balance?.usdc ?? '0').toFixed(2)}</p>
          </div>

          {/* Wallet ID — no Stellar mention */}
          <div className="bg-slate-50 dark:bg-slate-700 rounded-2xl p-3">
            <p className="text-xs text-slate-400 mb-1">Your Wallet ID</p>
            <p className="font-mono text-xs text-slate-600 dark:text-slate-300 break-all leading-relaxed">
              {wallet?.address}
            </p>
            <div className="flex gap-2 mt-2">
              <button onClick={copyAddress}
                className="flex items-center gap-1.5 text-xs text-primary font-semibold bg-primary/10 px-3 py-1.5 rounded-xl">
                <Copy size={12} /> Copy ID
              </button>
              {wallet?.network === 'testnet' && user?.walletKeyValid !== false && (
                <button onClick={fundWallet}
                  className="flex items-center gap-1.5 text-xs text-amber-600 font-semibold bg-amber-50 px-3 py-1.5 rounded-xl ml-auto">
                  <RefreshCw size={12} /> Activate wallet
                </button>
              )}
            </div>
          </div>

          {/* Recovery — fix a corrupt wallet key ("invalid initialization vector") */}
          {!showFix ? (
            <button onClick={() => setShowFix(true)}
              className="flex items-center justify-center gap-1.5 w-full text-xs text-slate-400 hover:text-primary py-1">
              <Wrench size={12} /> Wallet not working? Re-activate it
            </button>
          ) : (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 space-y-3">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Re-activate wallet</p>
              <p className="text-xs text-amber-600/80 dark:text-amber-500">
                If payments fail with a key error, this rebuilds your wallet. Only works when the
                old wallet is empty — it never touches a wallet that holds a balance.
              </p>
              <div className="flex justify-center [&_input]:!h-10 [&_input]:!w-10">
                <PinInput value={fixPin} onChange={setFixPin} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowFix(false); setFixPin(''); }}
                  className="flex-1 text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-500 py-2.5 rounded-xl">
                  Cancel
                </button>
                <button onClick={reactivateWallet} disabled={fixPin.length < 6 || fixing}
                  className="flex-1 text-xs font-bold text-white bg-amber-500 py-2.5 rounded-xl disabled:opacity-50">
                  {fixing ? 'Re-activating…' : 'Re-activate'}
                </button>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-400 text-center">
            Your Olomi Wallet is linked to {user?.phone}
          </p>
        </div>

        {/* ── Mobile Money → Olomi Wallet info ── */}
        <div className="bg-gradient-to-r from-[#1a3a6b] to-[#1a56db] rounded-3xl p-5 text-white">
          <div className="flex items-center gap-2 mb-2">
            <img src="/logo.svg" alt="" className="w-6 h-6" />
            <h3 className="font-bold">Mobile Money → Olomi Wallet</h3>
          </div>
          <p className="text-sm text-white/80 mb-3">
            Deposit via Mobile Money and your money is instantly available in your Olomi Wallet. Send, save, or convert anytime.
          </p>
          <div className="space-y-2">
            {[
              'Go to Deposit → enter amount → pay via Mobile Money',
              'Money is instantly credited to your Olomi Wallet',
              'Send to anyone, save for interest, or convert currencies',
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-2 bg-white/20 rounded-xl p-2.5 text-sm">
                <span className="w-5 h-5 bg-white/30 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">{i+1}</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
          <button onClick={() => router.push('/deposit')}
            className="mt-4 w-full bg-white text-primary font-bold py-3 rounded-2xl text-sm">
            Deposit via Mobile Money →
          </button>
        </div>

        {/* ── Quick links ── */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl divide-y divide-slate-100 dark:divide-slate-700">
          <button onClick={() => router.push('/business')}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700">
            <Briefcase size={18} className="text-primary" />
            <div className="flex-1 text-left">
              <p className="font-medium text-sm">Business</p>
              <p className="text-xs text-slate-400">Merchant payments &amp; payroll</p>
            </div>
          </button>
          <button onClick={() => router.push('/history')}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700">
            <History size={18} className="text-primary" />
            <div className="flex-1 text-left">
              <p className="font-medium text-sm">Transaction history</p>
              <p className="text-xs text-slate-400">All your past payments &amp; transfers</p>
            </div>
          </button>
        </div>

        {/* ── Security ── */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl divide-y divide-slate-100 dark:divide-slate-700">
          <button onClick={() => router.push('/kyc')}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700">
            <Shield size={18} className="text-primary" />
            <div className="flex-1 text-left">
              <p className="font-medium text-sm">KYC Verification</p>
              <p className="text-xs text-slate-400">Verify your identity to unlock higher limits</p>
            </div>
          </button>
          <button onClick={() => router.push('/support')}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700">
            <LifeBuoy size={18} className="text-primary" />
            <div className="flex-1 text-left">
              <p className="font-medium text-sm">Help &amp; support</p>
              <p className="text-xs text-slate-400">Open a request — our team will help you</p>
            </div>
          </button>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-red-50 dark:hover:bg-red-900/20 text-danger">
            <LogOut size={18} />
            <span className="font-medium text-sm">Sign out</span>
          </button>
        </div>

      </div>
      <BottomNav />
    </div>
  );
}
