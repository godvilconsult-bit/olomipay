'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, QrCode, TrendingUp, RefreshCw } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import { formatUsdc } from '../../lib/utils';

async function merchantApi(path: string, method = 'GET', body?: any) {
  const token = (sessionStorage.getItem('olomipay_at') || sessionStorage.getItem('olomipay_rt'));
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/merchant${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export default function MerchantPage() {
  const router  = useRouter();
  const [merchant, setMerchant] = useState<any>(null);
  const [stats,    setStats]    = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [form,     setForm]     = useState({ shopName: '', category: 'retail' });

  useEffect(() => {
    merchantApi('/qr').then(r => {
      if (r.success) setMerchant(r.data);
      setLoading(false);
    });
    merchantApi('/stats').then(r => r.success && setStats(r.data));
  }, []);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const r = await merchantApi('/register', 'POST', form);
    if (r.success) { setMerchant(r.data); toast.success('Shop registered!'); }
    else toast.error(r.error ?? 'Failed');
  }

  // Render QR as SVG path (simplified — use qrcode library in production)
  function QRCode({ data }: { data: string }) {
    return (
      <div className="bg-white p-4 rounded-2xl">
        <div className="w-48 h-48 bg-slate-100 rounded-xl flex items-center justify-center mx-auto">
          <div className="text-center">
            <QrCode size={64} className="text-slate-800 mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-mono break-all px-2" style={{ fontSize: '8px' }}>
              {data.slice(0, 40)}...
            </p>
          </div>
        </div>
        <p className="text-center text-xs text-slate-400 mt-2">
          Install qrcode npm package to render actual QR
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">Merchant QR</h1>
      </div>

      <div className="px-5 max-w-md mx-auto mt-4 space-y-4">
        {loading ? (
          <div className="skeleton h-64 rounded-3xl" />
        ) : !merchant ? (
          /* Registration form */
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="card text-center py-6">
              <div className="text-5xl mb-3">🏪</div>
              <h2 className="text-xl font-bold mb-2">Accept Payments</h2>
              <p className="text-sm text-slate-500">
                Get a QR code. Customers scan and pay instantly. No card machine needed.
              </p>
            </div>
            <div className="card space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Shop Name</label>
                <input type="text" placeholder="e.g. Mama Paka Duka" value={form.shopName}
                  onChange={e => setForm(f => ({ ...f, shopName: e.target.value }))}
                  className="input" required />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="input">
                  <option value="retail">Retail / Duka</option>
                  <option value="food">Food / Restaurant</option>
                  <option value="transport">Transport</option>
                  <option value="services">Services</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="education">Education</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <button type="submit" className="btn-primary w-full">Register My Shop</button>
          </form>
        ) : (
          <>
            {/* QR Code display */}
            <div className="card text-center">
              <h2 className="font-semibold text-lg mb-1">{merchant.shopName}</h2>
              <p className="text-xs text-slate-400 mb-4">Scan to pay with OlomiPay</p>
              <QRCode data={merchant.qrPayload} />
              <div className="mt-4 flex gap-2">
                <button className="btn-secondary flex-1 text-sm" onClick={() => {
                  navigator.clipboard.writeText(merchant.qrPayload);
                  toast.success('QR link copied!');
                }}>
                  Copy Link
                </button>
                <button className="btn-primary flex-1 text-sm" onClick={() => window.print()}>
                  Print QR
                </button>
              </div>
            </div>

            {/* Today's stats */}
            {stats && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Today', value: formatUsdc(stats.daily?.total ?? 0), sub: `${stats.daily?.count ?? 0} sales` },
                  { label: 'This Week', value: formatUsdc(stats.weekly?.total ?? 0), sub: `${stats.weekly?.count ?? 0} sales` },
                  { label: 'This Month', value: formatUsdc(stats.monthly?.total ?? 0), sub: `${stats.monthly?.count ?? 0} sales` },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="card text-center py-3">
                    <p className="text-xs text-slate-400 mb-1">{label}</p>
                    <p className="text-sm font-bold text-success">{value}</p>
                    <p className="text-xs text-slate-400">{sub}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Cashout */}
            <div className="card">
              <p className="text-sm font-medium mb-2 flex items-center gap-2">
                <TrendingUp size={14} className="text-success" />
                Total Sales: {formatUsdc(merchant.totalSales)}
              </p>
              <button className="btn-primary w-full text-sm" onClick={async () => {
                const r = await merchantApi('/cashout', 'POST', { amountUsdc: merchant.totalSales });
                if (r.success) toast.success(r.data.message);
              }}>
                Cash Out to Mobile Money
              </button>
            </div>

            {/* SEP-0007 URI info */}
            <div className="card bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-600 dark:text-blue-400">
              <p className="font-medium mb-1">Payment URI (SEP-0007)</p>
              <p className="font-mono break-all text-[10px]">{merchant.qrPayload}</p>
            </div>
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
