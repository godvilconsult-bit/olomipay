'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Gift, CheckCircle2 } from 'lucide-react';

export default function ClaimPage() {
  const { token } = useParams();
  const router    = useRouter();
  const [loading, setLoading]  = useState(false);
  const [claimed, setClaimed]  = useState(false);
  const [amount,  setAmount]   = useState<number | null>(null);

  async function handleClaim() {
    setLoading(true);
    const accessToken = (sessionStorage.getItem('olomipay_at') || sessionStorage.getItem('olomipay_rt'));
    if (!accessToken) { router.push(`/auth/login?redirect=/claim/${token}`); return; }

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/contacts/claim/${token}`,
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
    );
    const data = await res.json();
    setLoading(false);

    if (data.success) { setAmount(data.data.amountUsdc); setClaimed(true); }
    else toast.error(data.error ?? 'Claim failed');
  }

  if (claimed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 bg-slate-50 dark:bg-slate-900">
        <div className="text-center space-y-5 max-w-sm">
          <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={40} className="text-success" />
          </div>
          <h1 className="text-2xl font-bold">Funds Claimed! 🎉</h1>
          <p className="text-slate-500">${amount?.toFixed(2)} has been added to your wallet.</p>
          <button onClick={() => router.push('/dashboard')} className="btn-primary w-full">Go to Wallet</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 bg-slate-50 dark:bg-slate-900">
      <div className="text-center space-y-5 max-w-sm">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <Gift size={40} className="text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Someone sent you money!</h1>
        <p className="text-slate-500">
          You've received a payment via OlomiPay. Sign in to claim it.
        </p>
        <button onClick={handleClaim} disabled={loading} className="btn-primary w-full">
          {loading ? 'Claiming…' : 'Claim My Money'}
        </button>
        <button onClick={() => router.push('/auth/register')} className="btn-secondary w-full">
          Create account first
        </button>
      </div>
    </div>
  );
}
