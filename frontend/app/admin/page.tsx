'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Users, DollarSign, TrendingUp, Download, Search,
  RefreshCw, Shield, FileText, Filter, Send, Wallet,
} from 'lucide-react';
import BottomNav from '../../components/BottomNav';

const API = process.env.NEXT_PUBLIC_API_URL;
function getToken() {
  return sessionStorage.getItem('olomipay_at') || sessionStorage.getItem('olomipay_rt') || '';
}
async function adminApi(path: string, params: Record<string, string> = {}) {
  const q = new URLSearchParams(params).toString();
  const r = await fetch(`${API}/api/admin${path}${q ? '?' + q : ''}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  return r.json();
}

export default function AdminPage() {
  const router = useRouter();
  const [stats,    setStats]    = useState<any>(null);
  const [users,    setUsers]    = useState<any[]>([]);
  const [txs,      setTxs]      = useState<any[]>([]);
  const [wallet,   setWallet]   = useState<any>(null);
  const [tab,      setTab]      = useState('overview');
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate,   setToDate]   = useState('');
  const [busy,     setBusy]     = useState('');

  // Send Stellar form
  const [sendTo,     setSendTo]     = useState('');
  const [sendAmt,    setSendAmt]    = useState('');
  const [sendAsset,  setSendAsset]  = useState('XLM');
  const [sendMemo,   setSendMemo]   = useState('');
  const [sendResult, setSendResult] = useState<any>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [sR, uR, tR, wR] = await Promise.all([
        adminApi('/stats'),
        adminApi('/users'),
        adminApi('/transactions'),
        adminApi('/wallet'),
      ]);
      if (!sR.success) { toast.error('Admin access denied'); router.push('/dashboard'); return; }
      setStats(sR.data);
      setUsers(uR.data?.users ?? []);
      setTxs(tR.data?.transactions ?? []);
      if (wR.success) setWallet(wR.data);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }

  async function loadTxs() {
    const p: any = {};
    if (fromDate) p.from = fromDate;
    if (toDate)   p.to   = toDate;
    const r = await adminApi('/transactions', p);
    if (r.success) setTxs(r.data.transactions);
  }

  // ── CSV download ───────────────────────────────────────────────────────────
  async function downloadCsv() {
    setBusy('csv');
    try {
      const p = new URLSearchParams();
      if (fromDate) p.set('from', fromDate);
      if (toDate)   p.set('to',   toDate);
      const r = await fetch(`${API}/api/admin/report/csv?${p}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `olomipay_${fromDate || 'all'}_to_${toDate || 'now'}.csv`;
      a.click();
      toast.success('CSV downloaded!');
    } catch { toast.error('CSV failed'); }
    finally { setBusy(''); }
  }

  // ── PDF download — direct server-generated PDF ─────────────────────────────
  async function downloadPdf() {
    setBusy('pdf');
    try {
      const p = new URLSearchParams();
      if (fromDate) p.set('from', fromDate);
      if (toDate)   p.set('to',   toDate);
      const r = await fetch(`${API}/api/admin/report/pdf?${p}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!r.ok) { toast.error('PDF generation failed'); return; }
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `olomipay_report_${fromDate || 'all'}_to_${toDate || 'now'}.pdf`;
      a.click();
      toast.success('PDF downloaded!');
    } catch { toast.error('PDF failed'); }
    finally { setBusy(''); }
  }

  // ── Send Stellar ───────────────────────────────────────────────────────────
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!sendTo || !sendAmt) return toast.error('Fill all fields');
    setBusy('send');
    setSendResult(null);
    try {
      const r = await fetch(`${API}/api/admin/send-stellar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ toAddress: sendTo, amount: sendAmt, asset: sendAsset, memo: sendMemo }),
      });
      const data = await r.json();
      if (!data.success) throw new Error(data.error);
      setSendResult(data.data);
      toast.success(`Sent ${sendAmt} ${sendAsset} successfully!`);
      setSendTo(''); setSendAmt(''); setSendMemo('');
      loadAll();
    } catch (e: any) {
      toast.error(e.message ?? 'Send failed');
    } finally { setBusy(''); }
  }

  const filtered = users.filter(u =>
    !search || u.phone?.includes(search) || u.kycName?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <RefreshCw size={24} className="animate-spin text-primary" />
    </div>
  );

  const DateFilter = () => (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-slate-400 block mb-1">From date</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-700 rounded-xl px-3 py-2 text-sm outline-none border border-slate-200 dark:border-slate-600" />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">To date</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-700 rounded-xl px-3 py-2 text-sm outline-none border border-slate-200 dark:border-slate-600" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button onClick={loadTxs} className="bg-primary text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5">
          <Filter size={13} /> Filter
        </button>
        <button onClick={downloadCsv} disabled={busy === 'csv'}
          className="bg-green-500 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60">
          <Download size={13} /> {busy === 'csv' ? '…' : 'CSV'}
        </button>
        <button onClick={downloadPdf} disabled={busy === 'pdf'}
          className="bg-slate-700 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60">
          <FileText size={13} /> {busy === 'pdf' ? '…' : 'PDF'}
        </button>
      </div>
      <p className="text-xs text-slate-400 text-center">Leave dates empty for all-time report</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1a3a6b] to-[#1a56db] text-white px-5 py-5">
        <div className="flex items-center gap-3 mb-1">
          <img src="/logo.svg" alt="" className="w-8 h-8" />
          <div>
            <h1 className="font-bold text-lg">OlomiPay Admin</h1>
            <p className="text-xs text-blue-200">Platform Owner Dashboard</p>
          </div>
          <button onClick={loadAll} className="ml-auto p-2 bg-white/20 rounded-xl">
            <RefreshCw size={16} />
          </button>
        </div>
        {stats && (
          <p className="text-xs text-blue-200 mt-1 font-mono">
            Fee wallet: {stats.adminWallet?.slice(0, 8)}…{stats.adminWallet?.slice(-6)}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 overflow-x-auto">
        {['overview', 'users', 'transactions', 'fees', 'send'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors capitalize ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-slate-400'
            }`}>
            {t === 'send' ? '📤 Send' : t}
          </button>
        ))}
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-5 space-y-4">

        {/* ── Overview ──────────────────────────────────────────────────────── */}
        {tab === 'overview' && stats && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Users,      label: 'Total Users',   value: stats.totalUsers,                                     color: 'bg-blue-500'   },
                { icon: TrendingUp, label: 'Transactions',  value: stats.totalTransactions,                              color: 'bg-purple-500' },
                { icon: DollarSign, label: 'Volume USD',    value: `$${parseFloat(stats.totalVolumeUsdc).toFixed(2)}`,   color: 'bg-green-500'  },
                { icon: Shield,     label: 'Fees Earned',   value: `$${parseFloat(stats.feesCollectedUsdc).toFixed(4)}`, color: 'bg-amber-500'  },
              ].map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="bg-white dark:bg-slate-800 rounded-2xl p-4 flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={22} className="text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">{label}</p>
                    <p className="font-bold text-lg">{value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Platform wallet balances */}
            {wallet?.funded && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2"><Wallet size={16} className="text-primary" /> Platform Wallet Balances</p>
                <div className="space-y-2">
                  {wallet.balances.map((b: any, i: number) => (
                    <div key={i} className="flex items-center justify-between bg-slate-50 dark:bg-slate-700 rounded-xl px-3 py-2">
                      <span className="text-sm font-semibold">{b.asset}</span>
                      <span className="font-bold text-primary">{parseFloat(b.balance).toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DateFilter />
          </>
        )}

        {/* ── Users ─────────────────────────────────────────────────────────── */}
        {tab === 'users' && (
          <>
            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-2xl px-4 py-2.5">
              <Search size={16} className="text-slate-400 flex-shrink-0" />
              <input type="text" placeholder="Search by phone or name…" value={search}
                onChange={e => setSearch(e.target.value)} className="bg-transparent flex-1 text-sm outline-none" />
            </div>
            <p className="text-xs text-slate-400">{filtered.length} of {users.length} users</p>
            <div className="space-y-2">
              {filtered.map(u => (
                <div key={u.id} className="bg-white dark:bg-slate-800 rounded-2xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                      {(u.kycName ?? u.phone).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{u.kycName ?? 'No name'}</p>
                        {u.isAdmin && <span className="text-[10px] bg-primary text-white px-1.5 py-0.5 rounded-full font-bold">ADMIN</span>}
                        {u.isFeeCollector && <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold">FEE OWNER</span>}
                      </div>
                      <p className="text-xs text-slate-400">{u.phone}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-xs font-medium ${u.kycStatus === 'APPROVED' ? 'text-green-600' : 'text-slate-400'}`}>{u.kycStatus}</p>
                      <p className="text-[10px] text-slate-300">{new Date(u.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="mt-2 bg-slate-50 dark:bg-slate-700 rounded-xl px-3 py-1.5">
                    <p className="font-mono text-[10px] text-slate-500 break-all">{u.stellarPubKey ?? 'No wallet'}</p>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <p className="text-center text-slate-400 py-8">No users found</p>}
            </div>
          </>
        )}

        {/* ── Transactions ──────────────────────────────────────────────────── */}
        {tab === 'transactions' && (
          <>
            <DateFilter />
            <div className="space-y-2">
              {txs.slice(0, 200).map((t: any) => (
                <div key={t.id} className="bg-white dark:bg-slate-800 rounded-2xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        t.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' :
                        t.status === 'FAILED'    ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>{t.status}</span>
                      <span className="text-xs text-slate-500">{t.type}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm">${parseFloat(t.amountUsdc ?? 0).toFixed(2)}</p>
                      <p className="text-[10px] text-amber-600">fee: ${(parseFloat(t.amountUsdc ?? 0) * 0.01).toFixed(4)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{t.user?.kycName ?? ''} · {t.user?.phone ?? ''}</span>
                    <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
              {txs.length === 0 && <p className="text-center text-slate-400 py-8">No transactions found</p>}
            </div>
          </>
        )}

        {/* ── Fees ──────────────────────────────────────────────────────────── */}
        {tab === 'fees' && stats && (
          <>
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-5 text-white">
              <p className="text-sm text-white/80 mb-1">Total Fees Earned (1% per tx)</p>
              <p className="text-4xl font-bold">${parseFloat(stats.feesCollectedUsdc).toFixed(4)}</p>
              <p className="text-sm text-white/70 mt-1">From ${parseFloat(stats.totalVolumeUsdc).toFixed(2)} total volume</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 space-y-3">
              <p className="font-semibold text-sm">Your Fee Collection Wallet</p>
              <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-3">
                <p className="font-mono text-xs break-all text-slate-600 dark:text-slate-300">{stats.adminWallet}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => { navigator.clipboard.writeText(stats.adminWallet); toast.success('Copied!'); }}
                  className="bg-primary/10 text-primary font-semibold text-sm py-2 rounded-xl">Copy</button>
                <button onClick={downloadCsv} disabled={busy === 'csv'}
                  className="bg-green-500 text-white text-sm font-bold py-2 rounded-xl disabled:opacity-60">
                  {busy === 'csv' ? '…' : 'CSV'}
                </button>
                <button onClick={downloadPdf} disabled={busy === 'pdf'}
                  className="bg-primary text-white text-sm font-bold py-2 rounded-xl disabled:opacity-60">
                  {busy === 'pdf' ? '…' : 'PDF'}
                </button>
              </div>
              <p className="text-xs text-slate-400 text-center">Download by date range using the filter above</p>
            </div>
            <DateFilter />
          </>
        )}

        {/* ── Send Stellar ──────────────────────────────────────────────────── */}
        {tab === 'send' && (
          <>
            {/* Platform wallet balance */}
            {wallet?.funded && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2"><Wallet size={15} className="text-primary" /> Platform Wallet</p>
                <div className="bg-slate-50 dark:bg-slate-700 rounded-xl px-3 py-2 mb-3">
                  <p className="font-mono text-[10px] text-slate-500 break-all">{wallet.address}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {wallet.balances.map((b: any, i: number) => (
                    <div key={i} className="bg-primary/5 rounded-xl px-3 py-2 text-center">
                      <p className="text-xs text-slate-400">{b.asset}</p>
                      <p className="font-bold text-primary">{parseFloat(b.balance).toFixed(4)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5">
              <p className="font-semibold mb-4 flex items-center gap-2"><Send size={15} className="text-primary" /> Send from Platform Wallet</p>
              <form onSubmit={handleSend} className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">To Stellar Address</label>
                  <input
                    type="text" value={sendTo} onChange={e => setSendTo(e.target.value)}
                    placeholder="G... Stellar public key"
                    className="w-full bg-slate-50 dark:bg-slate-700 rounded-xl px-4 py-3 text-sm outline-none border border-slate-200 dark:border-slate-600 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1.5">Amount</label>
                    <input
                      type="number" step="any" value={sendAmt} onChange={e => setSendAmt(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-50 dark:bg-slate-700 rounded-xl px-4 py-3 text-sm outline-none border border-slate-200 dark:border-slate-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1.5">Asset</label>
                    <select value={sendAsset} onChange={e => setSendAsset(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-700 rounded-xl px-4 py-3 text-sm outline-none border border-slate-200 dark:border-slate-600">
                      <option value="XLM">XLM</option>
                      <option value="USDC">USDC</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">Memo (optional)</label>
                  <input
                    type="text" value={sendMemo} onChange={e => setSendMemo(e.target.value)}
                    placeholder="e.g. Admin payout"
                    maxLength={28}
                    className="w-full bg-slate-50 dark:bg-slate-700 rounded-xl px-4 py-3 text-sm outline-none border border-slate-200 dark:border-slate-600"
                  />
                </div>

                <button type="submit" disabled={busy === 'send'}
                  className="w-full bg-primary text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60">
                  {busy === 'send'
                    ? <><RefreshCw size={16} className="animate-spin" /> Sending…</>
                    : <><Send size={16} /> Send {sendAmt ? `${sendAmt} ${sendAsset}` : ''}</>
                  }
                </button>
              </form>

              {sendResult && (
                <div className="mt-4 bg-green-50 dark:bg-green-900/20 rounded-xl p-4 space-y-1">
                  <p className="text-sm font-bold text-green-700 dark:text-green-400">✓ Sent successfully</p>
                  <p className="text-xs text-slate-500">Amount: {sendResult.amount} {sendResult.asset}</p>
                  <p className="text-xs text-slate-500 font-mono break-all">TX: {sendResult.txHash}</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
