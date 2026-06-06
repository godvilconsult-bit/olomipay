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
  return localStorage.getItem('olomipay_at') || (localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt')) || '';
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
  const [stats,     setStats]     = useState<any>(null);
  const [users,     setUsers]     = useState<any[]>([]);
  const [txs,       setTxs]       = useState<any[]>([]);
  const [wallet,    setWallet]    = useState<any>(null);
  const [feeWallet, setFeeWallet] = useState<any>(null);
  const [wallets,   setWallets]   = useState<any>(null);   // combined gas + fees overview
  const [staff,     setStaff]     = useState<any>(null);   // staff-activity (super-admin)
  const [topupBusy, setTopupBusy] = useState(false);
  const [genBusy,   setGenBusy]   = useState(false);
  const [genFee,    setGenFee]    = useState<any>(null);   // generated fee keypair (shown once)
  const [setupBusy, setSetupBusy] = useState(false);
  const [tab,       setTab]       = useState('overview');
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
      const [sR, uR, tR, wR, fwR, walR] = await Promise.all([
        adminApi('/stats'),
        adminApi('/users'),
        adminApi('/transactions'),
        adminApi('/wallet'),
        adminApi('/fee-wallet'),
        adminApi('/wallets'),
      ]);
      if (!sR.success) { toast.error('Admin access denied'); router.push('/dashboard'); return; }
      setStats(sR.data);
      setUsers(uR.data?.users ?? []);
      setTxs(tR.data?.transactions ?? []);
      if (wR.success)  setWallet(wR.data);
      if (fwR.success) setFeeWallet(fwR.data);
      if (walR.success) setWallets(walR.data);
      // Staff-activity (SUPER_ADMIN only) — silently skipped for other roles
      adminApi('/staff-activity?days=7').then(r => { if (r.success) setStaff(r.data); }).catch(() => {});
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }

  async function handleTreasuryTopup() {
    setTopupBusy(true);
    try {
      const r = await fetch(`${API}/api/admin/treasury/topup`, {
        method: 'POST', headers: { Authorization: `Bearer ${getToken()}` },
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      const x = d.data;
      toast.success(x.refilled
        ? `Refilled +${(x.xlmAfter - x.xlmBefore).toFixed(2)} XLM for ${x.usdcSpent} USDC`
        : `No refill: ${x.reason}`);
      const walR = await adminApi('/wallets');
      if (walR.success) setWallets(walR.data);
    } catch (e: any) { toast.error(e.message ?? 'Top-up failed'); }
    finally { setTopupBusy(false); }
  }

  async function handleGenerateFeeWallet() {
    setGenBusy(true);
    try {
      const r = await fetch(`${API}/api/admin/wallets/generate-fee`, {
        method: 'POST', headers: { Authorization: `Bearer ${getToken()}` },
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      setGenFee(d.data);
    } catch (e: any) { toast.error(e.message ?? 'Failed to generate'); }
    finally { setGenBusy(false); }
  }

  async function handleFeeWalletSetup() {
    setSetupBusy(true);
    try {
      const r = await fetch(`${API}/api/admin/fee-wallet/setup`, {
        method: 'POST', headers: { Authorization: `Bearer ${getToken()}` },
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      toast.success(d.data.message ?? 'Fee wallet configured!');
      // Reload fee wallet status
      const fwR = await adminApi('/fee-wallet');
      if (fwR.success) setFeeWallet(fwR.data);
    } catch (e: any) {
      toast.error(e.message ?? 'Setup failed');
    } finally { setSetupBusy(false); }
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
      toast.success(data.data.executed
        ? `Sent ${sendAmt} ${sendAsset} successfully!`
        : (data.data.message ?? 'Queued for approval'));
      setSendTo(''); setSendAmt(''); setSendMemo('');
      loadAll();
    } catch (e: any) {
      toast.error(e.message ?? 'Send failed');
    } finally { setBusy(''); }
  }

  const filtered = users.filter(u =>
    !search
    || u.phone?.includes(search)
    || u.kycName?.toLowerCase().includes(search.toLowerCase())
    || u.accountNo?.toLowerCase().includes(search.toLowerCase())
  );

  // Server-side search (covers ALL users, not just the loaded page) — debounced.
  useEffect(() => {
    if (!search.trim()) return;
    const t = setTimeout(async () => {
      const r = await adminApi('/users', { q: search.trim() });
      if (r.success) setUsers(r.data.users ?? []);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

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
    <div className="min-h-screen pb-24">
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
          <p className="text-xs text-blue-200 mt-1 font-mono flex items-center gap-2 flex-wrap">
            Fee wallet: {stats.adminWallet?.slice(0, 8)}…{stats.adminWallet?.slice(-6)}
            {feeWallet && (
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                feeWallet.isSameAsPlatform ? 'bg-amber-400/30 text-amber-100' : 'bg-green-400/30 text-green-100'
              }`}>
                {feeWallet.isSameAsPlatform ? '🔗 shared' : '✓ dedicated'}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 overflow-x-auto">
        {[
          { id: 'overview',     label: 'Overview'    },
          { id: 'users',        label: 'Users'       },
          { id: 'transactions', label: 'Transactions'},
          { id: 'fees',         label: '💰 Fees'     },
          { id: 'fee-wallet',   label: '🏦 Fee Wallet'},
          { id: 'send',         label: '📤 Send'     },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-slate-400'
            }`}>
            {t.label}
            {t.id === 'fee-wallet' && feeWallet && !feeWallet.ready && (
              <span className="ml-1 w-2 h-2 bg-amber-400 rounded-full inline-block" />
            )}
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
              <input type="text" placeholder="Search by name, phone or OP-account no…" value={search}
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
                        {u.isFrozen && <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold">FROZEN</span>}
                      </div>
                      {/* Primary account identifier — the immutable OP-XXXX */}
                      <button
                        onClick={() => { navigator.clipboard.writeText(u.accountNo ?? ''); toast.success('Account no. copied'); }}
                        className="font-mono text-xs font-semibold text-primary">{u.accountNo ?? '—'}</button>
                      <p className="text-xs text-slate-400">{u.phone}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-xs font-medium ${u.kycStatus === 'APPROVED' ? 'text-green-600' : 'text-slate-400'}`}>{u.kycStatus}</p>
                      <p className="text-[10px] text-slate-300">{new Date(u.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  {/* Wallet address kept for staff (external transfers / on-chain lookup) */}
                  <div className="mt-2 bg-slate-50 dark:bg-slate-700 rounded-xl px-3 py-1.5">
                    <p className="text-[9px] uppercase tracking-wide text-slate-400">Wallet address</p>
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
              <p className="text-sm text-white/80 mb-1">Total Fees Collected (1% per tx — actual records)</p>
              <p className="text-4xl font-bold">${parseFloat(stats.feesCollectedUsdc ?? 0).toFixed(4)} USDC</p>
              <p className="text-sm text-white/70 mt-1">
                {stats.feeTxCount} fee transactions · from ${parseFloat(stats.totalVolumeUsdc ?? 0).toFixed(2)} volume
              </p>
            </div>
            {/* ── Gas treasury + Fees wallet (separated, auto-communicating) ── */}
            {wallets && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">Platform Wallets</p>
                  <span className={`text-xs px-2 py-1 rounded-full font-bold ${wallets.separated ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {wallets.separated ? 'Separated ✓' : 'Shared ⚠'}
                  </span>
                </div>

                {/* Low-gas alert */}
                {wallets.gas?.low && (
                  <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 flex items-start gap-2">
                    <span>⛽</span>
                    <p className="text-xs text-red-600 dark:text-red-400">
                      Gas treasury is low. {wallets.autoRefill ? 'Auto-refill from fees is enabled, or' : ''} top it up now.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {/* Gas wallet */}
                  <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-3 space-y-1">
                    <p className="text-xs text-slate-400">⛽ Gas wallet (XLM)</p>
                    <p className={`font-bold text-lg ${wallets.gas?.healthy ? 'text-slate-700 dark:text-slate-200' : 'text-red-500'}`}>
                      {Number(wallets.gas?.xlm ?? 0).toFixed(2)}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      ~{wallets.gas?.estAccountsLeft?.toLocaleString()} accounts · ~{wallets.gas?.estTxLeft?.toLocaleString()} txs left
                    </p>
                  </div>
                  {/* Fees wallet */}
                  <div className="bg-primary/5 rounded-xl p-3 space-y-1">
                    <p className="text-xs text-slate-400">💰 Fees wallet (USDC)</p>
                    <p className="font-bold text-primary text-lg">${Number(wallets.fees?.usdc ?? 0).toFixed(2)}</p>
                    <p className="text-[10px] text-slate-400">Revenue + activation fees</p>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 dark:bg-slate-700 p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {wallets.autoRefill
                      ? '✓ Auto-refill ON — when gas runs low, the fees wallet automatically funds it (USDC → XLM).'
                      : 'ℹ️ Auto-refill OFF — set FEE_WALLET_PUBLIC + FEE_WALLET_SECRET (separate from the gas key) so fees can auto-fund gas.'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleTreasuryTopup} disabled={topupBusy}
                    className="bg-grad-brand text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                    {topupBusy ? 'Topping up…' : 'Top up gas now'}
                  </button>
                  {!wallets.separated && (
                    <button onClick={handleGenerateFeeWallet} disabled={genBusy}
                      className="bg-slate-100 dark:bg-slate-700 font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                      {genBusy ? 'Generating…' : 'Generate fee wallet'}
                    </button>
                  )}
                </div>

                {/* One-time reveal of the generated fee keypair + env vars */}
                {genFee && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800 p-3 space-y-2">
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
                      ⚠ Save these now — the secret is shown only once
                    </p>
                    <div className="space-y-1.5">
                      {[
                        ['FEE_WALLET_PUBLIC', genFee.env?.FEE_WALLET_PUBLIC],
                        ['FEE_WALLET_SECRET', genFee.env?.FEE_WALLET_SECRET],
                      ].map(([k, v]) => (
                        <div key={k} className="bg-white dark:bg-slate-800 rounded-lg p-2">
                          <p className="text-[10px] text-slate-400">{k}</p>
                          <div className="flex items-center gap-2">
                            <p className="font-mono text-[11px] break-all flex-1 text-slate-700 dark:text-slate-200">{v}</p>
                            <button onClick={() => { navigator.clipboard.writeText(v as string); toast.success('Copied'); }}
                              className="text-primary text-xs font-semibold shrink-0">Copy</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {(genFee.steps ?? []).map((s: string, i: number) => <li key={i}>{s}</li>)}
                    </ol>
                    <button onClick={() => setGenFee(null)}
                      className="text-xs text-slate-400 underline">I’ve saved them — hide</button>
                  </div>
                )}
              </div>
            )}

            {/* Staff activity — internal-fraud watch (SUPER_ADMIN only) */}
            {staff && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">Staff activity (7 days)</p>
                  <span className="text-xs text-slate-400">{staff.totalActions} actions</span>
                </div>
                {(staff.staff ?? []).length === 0 ? (
                  <p className="text-xs text-slate-400">No back-office actions in this period.</p>
                ) : (
                  <div className="space-y-1.5">
                    {(staff.staff ?? []).slice(0, 6).map((s: any) => (
                      <div key={s.adminId} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${s.flags.length ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-slate-50 dark:bg-slate-700/40'}`}>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{s.adminPhone ?? s.adminId.slice(0, 8)}</p>
                          <p className="text-[11px] text-slate-400">
                            {s.sensitive} money/access · {s.offHours} off-hours · {s.distinctIps} IP{s.distinctIps === 1 ? '' : 's'}
                          </p>
                        </div>
                        {s.flags.length > 0 && (
                          <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold flex-shrink-0">
                            ⚠ {s.flags.length}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-slate-400">Watch for ⚠ flags: high money/access volume, off-hours, or many IPs.</p>
              </div>
            )}

            {/* Fee wallet live balance */}
            {feeWallet && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">Fee Wallet Live Balance</p>
                  <span className={`text-xs px-2 py-1 rounded-full font-bold ${feeWallet.ready ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {feeWallet.ready ? '✓ Ready' : '⚠ Setup needed'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-primary/5 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-400">USDC Balance</p>
                    <p className="font-bold text-primary text-lg">${parseFloat(feeWallet.balances?.usdc ?? 0).toFixed(4)}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-400">XLM Balance</p>
                    <p className="font-bold text-slate-700 dark:text-slate-200 text-lg">{parseFloat(feeWallet.balances?.xlm ?? 0).toFixed(4)}</p>
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1">Fee Wallet Address</p>
                  <p className="font-mono text-xs break-all text-slate-600 dark:text-slate-300">{feeWallet.feeWallet}</p>
                </div>

                {/* Shared vs dedicated status — never confusing again */}
                <div className={`rounded-xl p-3 border ${
                  feeWallet.isSameAsPlatform
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                    : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{feeWallet.isSameAsPlatform ? '🔗' : '✓'}</span>
                    <p className={`text-sm font-bold ${feeWallet.isSameAsPlatform ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}`}>
                      {feeWallet.isSameAsPlatform ? 'Shared with platform wallet' : 'Dedicated fee wallet'}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                    {feeWallet.isSameAsPlatform
                      ? 'Fees collect into the SAME address that funds accounts & disburses deposits. To separate revenue for cleaner accounting, set FEE_WALLET_PUBLIC in Railway.'
                      : 'Fees collect into their OWN address, separate from operating funds — ideal for clean revenue accounting.'}
                  </p>
                  {feeWallet.platformWallet && (
                    <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-white/10 space-y-0.5">
                      <p className="text-[10px] text-slate-400">Platform wallet: <span className="font-mono">{feeWallet.platformWallet.slice(0,8)}…{feeWallet.platformWallet.slice(-6)}</span></p>
                      <p className="text-[10px] text-slate-400">Configured via: <span className="font-semibold">{feeWallet.configuredVia}</span></p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => { navigator.clipboard.writeText(feeWallet.feeWallet); toast.success('Copied!'); }}
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
              </div>
            )}
            <DateFilter />
          </>
        )}

        {/* ── Fee Wallet ────────────────────────────────────────────────────── */}
        {tab === 'fee-wallet' && (
          <div className="space-y-4">
            {feeWallet ? (
              <>
                {/* Status card */}
                <div className={`rounded-2xl p-5 ${feeWallet.ready
                  ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-bold text-lg">{feeWallet.ready ? '✓ Fee Wallet Ready' : '⚠ Fee Wallet Needs Setup'}</p>
                    <span className="text-xs bg-white/20 px-2 py-1 rounded-full">{feeWallet.network}</span>
                  </div>
                  <p className="text-sm opacity-80 mb-1">Total Fees Collected</p>
                  <p className="text-3xl font-bold">${parseFloat(feeWallet.totalFeesCollected?.usdc ?? 0).toFixed(4)} USDC</p>
                  <p className="text-xs opacity-70 mt-1">{feeWallet.totalFeesCollected?.txCount ?? 0} fee transactions recorded</p>
                </div>

                {/* Address */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 space-y-3">
                  <p className="font-semibold text-sm">Fee Wallet Address</p>
                  <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-3">
                    <p className="font-mono text-xs break-all">{feeWallet.feeWallet}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { navigator.clipboard.writeText(feeWallet.feeWallet); toast.success('Copied!'); }}
                      className="flex-1 bg-primary/10 text-primary text-sm font-semibold py-2.5 rounded-xl">Copy</button>
                    <a href={feeWallet.explorerUrl} target="_blank" rel="noopener noreferrer"
                      className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold py-2.5 rounded-xl text-center">
                      Explorer ↗
                    </a>
                  </div>
                </div>

                {/* Live balances */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">Live On-Chain Balances</p>
                    <button onClick={loadAll} className="text-xs text-primary">Refresh</button>
                  </div>
                  <div className="space-y-2">
                    {(feeWallet.allBalances ?? []).length > 0 ? (
                      (feeWallet.allBalances ?? []).map((b: any, i: number) => (
                        <div key={i} className="flex items-center justify-between bg-slate-50 dark:bg-slate-700 rounded-xl px-4 py-3">
                          <div>
                            <p className="font-semibold text-sm">{b.asset}</p>
                            {b.issuer && <p className="text-xs text-slate-400 font-mono">{b.issuer.slice(0,8)}…</p>}
                          </div>
                          <p className="font-bold text-primary">{parseFloat(b.balance).toFixed(4)}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-400 text-center py-4">
                        {feeWallet.funded ? 'No balances found' : 'Wallet not yet funded'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Setup status */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 space-y-3">
                  <p className="font-semibold text-sm">Configuration</p>
                  {[
                    { label: 'Wallet funded',       ok: feeWallet.funded        },
                    { label: 'USDC trustline active', ok: feeWallet.hasUsdcTrustline },
                    { label: 'Same as platform wallet', ok: feeWallet.isSameAsPlatform, neutral: true },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm text-slate-600 dark:text-slate-300">{item.label}</span>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                        item.neutral ? 'bg-blue-100 text-blue-700' :
                        item.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {item.neutral ? (item.ok ? 'Yes' : 'No') : (item.ok ? '✓ Yes' : '✗ No')}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-300">Configured via</span>
                    <span className="text-xs font-mono bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg">{feeWallet.configuredVia}</span>
                  </div>
                </div>

                {/* Setup button */}
                {!feeWallet.ready && (
                  <button onClick={handleFeeWalletSetup} disabled={setupBusy}
                    className="w-full bg-primary text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60">
                    {setupBusy
                      ? <><RefreshCw size={16} className="animate-spin" /> Setting up…</>
                      : '⚡ Setup Fee Wallet (Fund + Add USDC Trustline)'}
                  </button>
                )}
                {feeWallet.ready && (
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-4 text-center">
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                      ✅ Fee wallet is fully configured and receiving fees
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                      All 1% platform fees flow here automatically on every transaction
                    </p>
                  </div>
                )}

                {/* Production note */}
                {feeWallet.isSameAsPlatform && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 space-y-1">
                    <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">ℹ️ Testnet: shared wallet</p>
                    <p className="text-xs text-blue-600 dark:text-blue-300">
                      Fee wallet and platform wallet are the same address. For mainnet, set{' '}
                      <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">FEE_WALLET_PUBLIC</code> and{' '}
                      <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">FEE_WALLET_SECRET</code> to a
                      separate keypair for clean accounting.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex justify-center py-16"><RefreshCw size={24} className="animate-spin text-primary" /></div>
            )}
          </div>
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
                <div className={`mt-4 rounded-xl p-4 space-y-1 ${sendResult.executed ? 'bg-green-50 dark:bg-green-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
                  <p className={`text-sm font-bold ${sendResult.executed ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
                    {sendResult.executed ? '✓ Sent successfully' : '⏳ Queued for approval'}
                  </p>
                  <p className="text-xs text-slate-500">{sendResult.message}</p>
                  {sendResult.executed && sendResult.result && (
                    <p className="text-xs text-slate-500 font-mono break-all">TX: {sendResult.result}</p>
                  )}
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
