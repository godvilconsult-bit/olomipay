'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import PageHeader from '../../components/PageHeader';

async function cardApi(path: string, method = 'GET', body?: any) {
  const token = (localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt'));
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/card${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export default function CardPage() {
  const router = useRouter();
  const [card,    setCard]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    cardApi('/details').then(r => { if (r.success) setCard(r.data); setLoading(false); });
  }, []);

  async function handleIssue() {
    const pin = prompt('Enter PIN to issue virtual card:');
    if (!pin) return;
    const r = await cardApi('/issue', 'POST', { pin });
    if (r.success) { setCard(r.data); toast.success('Virtual card issued!'); }
    else toast.error(r.error ?? 'Failed');
  }

  async function toggleFreeze() {
    const action = card?.status === 'frozen' ? 'unfreeze' : 'freeze';
    const r = await cardApi(`/${action}`, 'POST');
    if (r.success) { setCard((c: any) => ({ ...c, status: action === 'freeze' ? 'frozen' : 'active' })); toast.success(r.data.message); }
    else toast.error(r.error ?? 'Failed');
  }

  return (
    <div className="min-h-screen pb-24">
      <PageHeader eyebrow="Money" title="Virtual Card" />

      <div className="px-5 max-w-md mx-auto mt-4 space-y-4">
        {loading ? (
          <div className="skeleton h-48 rounded-3xl" />
        ) : !card ? (
          <div className="space-y-4">
            <div className="card text-center py-8">
              <div className="text-5xl mb-4">💳</div>
              <h2 className="text-xl font-bold mb-2">Get a Virtual Card</h2>
              <p className="text-sm text-slate-500 mb-4">
                Spend your balance anywhere Visa is accepted online. Linked to your wallet balance.
              </p>
              <div className="text-left space-y-2 text-sm text-slate-500 mb-6">
                <p>✅ Instant issuance</p>
                <p>✅ Spend globally</p>
                <p>✅ Freeze/unfreeze anytime</p>
                <p>✅ KYC required</p>
              </div>
              <button onClick={handleIssue} className="btn-primary w-full">Issue My Card</button>
            </div>
          </div>
        ) : (
          <>
            {/* Card visual */}
            <div className={`relative w-full aspect-[1.6/1] rounded-3xl overflow-hidden cursor-pointer transition-all duration-500
              ${card.status === 'frozen' ? 'grayscale opacity-70' : ''}
              bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900`}
              onClick={() => setFlipped(f => !f)}>
              <div className="absolute inset-0 p-6 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <span className="text-white font-bold text-lg">OlomiPay</span>
                  {card.status === 'frozen' && (
                    <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded-full font-medium">FROZEN</span>
                  )}
                </div>
                <div>
                  <p className="text-white/60 text-xs mb-1 font-mono">
                    {flipped ? 'CVV: ***' : card.maskedNumber}
                  </p>
                  <p className="text-white font-mono text-sm">
                    {card.expiryMonth.toString().padStart(2,'0')}/{card.expiryYear}
                  </p>
                </div>
              </div>
              {/* Chip */}
              <div className="absolute top-14 left-6 w-10 h-8 bg-amber-400/80 rounded-md" />
            </div>

            <p className="text-center text-xs text-slate-400">Tap card to flip</p>

            {/* Controls */}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={toggleFreeze}
                className={`card flex flex-col items-center gap-2 py-4 min-h-[80px] ${card.status === 'frozen' ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                {card.status === 'frozen'
                  ? <Unlock size={22} className="text-blue-500" />
                  : <Lock size={22} className="text-slate-500" />}
                <span className="text-sm font-medium">{card.status === 'frozen' ? 'Unfreeze' : 'Freeze'}</span>
              </button>
              <div className="card flex flex-col items-center gap-2 py-4 min-h-[80px]">
                <span className="text-2xl">💵</span>
                <span className="text-xs text-slate-500">Daily limit</span>
                <span className="text-sm font-bold">${card.dailyLimit}</span>
              </div>
            </div>

            {/* Info */}
            <div className="card bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-700 dark:text-blue-400">
              <p className="font-medium mb-1">How to use your card</p>
              <p className="text-xs text-blue-600/80">
                Use your card number and expiry for online purchases. Your balance is automatically debited.
                Card details are never stored — they appeared only once at issuance.
              </p>
            </div>
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
