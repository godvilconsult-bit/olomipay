'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Copy, LogOut, Shield, ChevronRight } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import StatusBadge from '../../components/StatusBadge';
import { auth, kyc, clearTokens } from '../../lib/api';
import { formatPhone, truncateAddress } from '../../lib/utils';

export default function ProfilePage() {
  const router  = useRouter();
  const [user,    setUser]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [kycData, setKycData] = useState({ idType: '', idNumber: '', name: '' });
  const [submitting, setSubmitting] = useState(false);
  const [showKyc, setShowKyc] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await auth.me();
        setUser(res.user);
      } catch {
        router.replace('/auth/login');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function copyAddress() {
    navigator.clipboard.writeText(user.stellarPubKey);
    toast.success('Address copied!');
  }

  async function handleLogout() {
    await auth.logout().catch(() => {});
    clearTokens();
    router.push('/');
  }

  async function handleKycSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await kyc.submit(kycData as any);
      toast.success('KYC submitted!');
      setUser((u: any) => ({ ...u, kycStatus: res.kycStatus }));
      setShowKyc(false);
    } catch (err: any) {
      toast.error(err.message ?? 'KYC submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-24">
        <div className="px-5 max-w-md mx-auto mt-8 space-y-4">
          <div className="skeleton h-24 rounded-3xl" />
          <div className="skeleton h-40 rounded-3xl" />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-24">
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">Profile</h1>
      </div>

      <div className="px-5 max-w-md mx-auto mt-4 space-y-4">
        {/* User info */}
        <div className="card text-center py-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl font-bold text-primary">
              {user?.phone?.[4] ?? '?'}
            </span>
          </div>
          <p className="font-semibold text-lg">{formatPhone(user?.phone ?? '')}</p>
          <div className="mt-1 flex items-center justify-center">
            <StatusBadge status={user?.kycStatus} />
          </div>
        </div>

        {/* Stellar address */}
        <div className="card">
          <p className="text-xs font-medium text-slate-500 mb-2">Stellar Address</p>
          <div className="flex items-center gap-2">
            <p className="text-sm font-mono text-slate-700 dark:text-slate-300 flex-1 truncate">
              {user?.stellarPubKey}
            </p>
            <button onClick={copyAddress} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 min-h-[40px] min-w-[40px] flex items-center justify-center">
              <Copy size={16} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* KYC */}
        {user?.kycStatus !== 'APPROVED' && (
          <div className="card">
            <button
              onClick={() => setShowKyc(!showKyc)}
              className="flex items-center w-full gap-3 min-h-[48px]"
            >
              <Shield size={20} className="text-amber-500" />
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">Verify Identity (KYC)</p>
                <p className="text-xs text-slate-400">Unlock higher limits</p>
              </div>
              <ChevronRight size={16} className={`text-slate-400 transition-transform ${showKyc ? 'rotate-90' : ''}`} />
            </button>

            {showKyc && (
              <form onSubmit={handleKycSubmit} className="mt-4 space-y-3 border-t border-slate-100 dark:border-slate-700 pt-4">
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Full name</label>
                  <input
                    type="text"
                    className="input"
                    value={kycData.name}
                    onChange={e => setKycData(d => ({ ...d, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">ID Type</label>
                  <select
                    className="input"
                    value={kycData.idType}
                    onChange={e => setKycData(d => ({ ...d, idType: e.target.value }))}
                    required
                  >
                    <option value="">Select…</option>
                    <option value="NIDA">NIDA Card</option>
                    <option value="PASSPORT">Passport</option>
                    <option value="VOTERS_ID">Voter's ID</option>
                    <option value="DRIVING_LICENSE">Driving License</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">ID Number</label>
                  <input
                    type="text"
                    className="input"
                    value={kycData.idNumber}
                    onChange={e => setKycData(d => ({ ...d, idNumber: e.target.value }))}
                    required
                  />
                </div>
                <button type="submit" disabled={submitting} className="btn-primary w-full">
                  {submitting ? 'Submitting…' : 'Submit KYC'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Settings links */}
        <div className="card divide-y divide-slate-100 dark:divide-slate-700">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full py-4 min-h-[56px] text-danger"
          >
            <LogOut size={18} />
            <span className="text-sm font-medium">Sign out</span>
          </button>
        </div>

        <p className="text-center text-xs text-slate-400 pb-4">
          OlomiPay v1.0.0 · Powered by Stellar Soroban
        </p>
      </div>

      <BottomNav />
    </div>
  );
}
