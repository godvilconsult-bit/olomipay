'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  ArrowLeft, CheckCircle2, Smartphone, Building2, ChevronRight,
  Copy, Share2, QrCode, Wallet, Zap, ExternalLink, RefreshCw,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import BottomNav from '../../components/BottomNav';
import { mobile_money } from '../../lib/api';
import { formatTzs, formatUsdc } from '../../lib/utils';

// Dynamically import QRCode to avoid SSR issues
const QRCodeSVG = dynamic(() => import('qrcode.react').then(m => m.QRCodeSVG), { ssr: false });

const API = process.env.NEXT_PUBLIC_API_URL;
function getToken() {
  return sessionStorage.getItem('olomipay_at') || (sessionStorage.getItem('olomipay_at') || sessionStorage.getItem('olomipay_rt')) || '';
}

type Tab     = 'receive' | 'mobile' | 'bank';
type MomoStep = 'method' | 'amount' | 'waiting' | 'success';

const MOBILE_MONEY_PROVIDERS = [
  { id: 'mpesa',    name: 'M-Pesa',        flag: '🇰🇪🇹🇿', color: '#00A651', countries: 'Kenya, Tanzania'                  },
  { id: 'airtel',   name: 'Airtel Money',  flag: '🇺🇬🇿🇲🇷🇼', color: '#FF0000', countries: 'Uganda, Zambia, Rwanda'           },
  { id: 'mtn',      name: 'MTN MoMo',      flag: '🇬🇭🇺🇬', color: '#FFC107', countries: 'Ghana, Uganda, South Africa'       },
  { id: 'tigo',     name: 'Tigo Pesa',     flag: '🇹🇿🇬🇭', color: '#00AEEF', countries: 'Tanzania, Ghana'                   },
  { id: 'orange',   name: 'Orange Money',  flag: '🇸🇳🇨🇮', color: '#FF6600', countries: "Senegal, Côte d'Ivoire, Mali"      },
  { id: 'zamtel',   name: 'Zamtel Kwacha', flag: '🇿🇲',    color: '#009C44', countries: 'Zambia'                             },
  { id: 'econet',   name: 'EcoCash',       flag: '🇿🇼',    color: '#FF6600', countries: 'Zimbabwe'                           },
];

const BANK_PROVIDERS = [
  { id: 'bank_tz',   name: 'Tanzania Banks',        flag: '🇹🇿', desc: 'CRDB, NMB, NBC, Equity, DTB'        },
  { id: 'bank_ke',   name: 'Kenya Banks',            flag: '🇰🇪', desc: 'KCB, Equity, Cooperative, NCBA'    },
  { id: 'bank_ug',   name: 'Uganda Banks',           flag: '🇺🇬', desc: 'Stanbic, Absa, DFCU, Centenary'    },
  { id: 'bank_intl', name: 'International Transfer', flag: '🌍', desc: 'SWIFT / SEPA / Wire Transfer'       },
];

export default function DepositPage() {
  const router = useRouter();
  const [tab,         setTab]         = useState<Tab>('receive');
  const [momoStep,    setMomoStep]    = useState<MomoStep>('method');
  const [momoMethod,  setMomoMethod]  = useState<any>(null);
  const [amount,      setAmount]      = useState('');
  const [rate,        setRate]        = useState(2600);
  const [loading,     setLoading]     = useState(false);

  // Receive / QR state
  const [receiveData, setReceiveData] = useState<any>(null);
  const [rcvLoading,  setRcvLoading]  = useState(true);
  const [fundLoading, setFundLoading] = useState(false);
  const [accountInfo, setAccountInfo] = useState<any>(null);

  const [rateData,    setRateData]    = useState<any>(null);
  const [feePreview,  setFeePreview]  = useState<any>(null);
  const [feeLoading,  setFeeLoading]  = useState(false);

  useEffect(() => {
    // Load rate with full fee schedule
    fetch(`${API}/api/mpesa/rate?currency=TZS`)
      .then(r => r.json())
      .then(d => {
        setRateData(d);
        setRate(d.usdBuyRate ?? d.usdcToTzs ?? 2600);
      })
      .catch(() => {});
    loadReceiveData();
  }, []);

  async function loadReceiveData() {
    setRcvLoading(true);
    try {
      const [rcvRes, accRes] = await Promise.all([
        fetch(`${API}/api/wallet/receive`, { headers: { Authorization: `Bearer ${getToken()}` } }),
        fetch(`${API}/api/wallet/account-info`, { headers: { Authorization: `Bearer ${getToken()}` } }),
      ]);
      const rcv = await rcvRes.json();
      const acc = await accRes.json();
      setReceiveData(rcv);
      setAccountInfo(acc);
    } catch { toast.error('Failed to load wallet info'); }
    finally { setRcvLoading(false); }
  }

  async function triggerFriendbot() {
    setFundLoading(true);
    try {
      const r = await fetch(`${API}/api/wallet/friendbot`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const d = await r.json();
      toast.success(d.message ?? 'Funding requested!');
      setTimeout(loadReceiveData, 3000); // wait 3s then refresh
    } catch { toast.error('Friendbot failed'); }
    finally { setFundLoading(false); }
  }

  function copyAddress() {
    if (!receiveData?.address) return;
    navigator.clipboard.writeText(receiveData.address);
    toast.success('Address copied!');
  }

  async function shareAddress() {
    if (!receiveData?.address) return;
    if (navigator.share) {
      await navigator.share({
        title: 'My OlomiPay Wallet Address',
        text:  `Send money to my OlomiPay wallet:\n${receiveData.address}`,
        url:   receiveData.explorerUrl,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(receiveData.address);
      toast.success('Address copied to clipboard!');
    }
  }

  const amountNum  = parseInt(amount.replace(/,/g, ''), 10) || 0;
  const amountUsdc = amountNum / rate;
  const fee        = amountUsdc * 0.01;
  const netUsdc    = amountUsdc - fee;

  // Fetch full fee breakdown when amount changes
  useEffect(() => {
    if (amountNum < 500) { setFeePreview(null); return; }
    const t = setTimeout(async () => {
      setFeeLoading(true);
      try {
        const r = await fetch(`${API}/api/mpesa/fee-preview?amount=${amountNum}&currency=TZS&type=deposit`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const d = await r.json();
        if (d.success) setFeePreview(d.fees);
      } catch {}
      finally { setFeeLoading(false); }
    }, 600);
    return () => clearTimeout(t);
  }, [amountNum]);

  async function handleDeposit() {
    if (amountNum < 500) { toast.error('Minimum deposit is 500 local currency'); return; }
    setLoading(true);
    try {
      await mobile_money.deposit(amountNum);
      setMomoStep('waiting');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to initiate deposit. Please try again.');
    } finally { setLoading(false); }
  }

  // ── QR URI to show ─────────────────────────────────────────────────────────
  const qrUri = receiveData?.usdcQrUri;

  // ── MOMO: waiting step ─────────────────────────────────────────────────────
  if (tab === 'mobile' && momoStep === 'waiting') return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 pb-24">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto animate-pulse">
          <Smartphone size={40} className="text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Check your phone</h2>
        <p className="text-slate-500">A payment prompt has been sent to your {momoMethod?.name ?? 'mobile money'} number. Approve it to complete your deposit.</p>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-4 text-left space-y-2">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Deposit summary</p>
          <div className="flex justify-between text-sm"><span className="text-slate-500">You pay</span><span className="font-semibold">{amountNum.toLocaleString()}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">OlomiPay fee (1%)</span><span className="text-amber-600">− {formatUsdc(fee)}</span></div>
          <div className="flex justify-between text-sm font-bold border-t border-amber-200 pt-2"><span>You receive</span><span className="text-green-600">{formatUsdc(netUsdc)} USD</span></div>
        </div>
        <button onClick={() => setMomoStep('success')} className="btn-primary w-full">I've approved the payment →</button>
        <button onClick={() => router.push('/dashboard')} className="text-sm text-slate-400 min-h-[44px]">Cancel</button>
      </div>
      <BottomNav />
    </div>
  );

  if (tab === 'mobile' && momoStep === 'success') return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 pb-24">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 size={40} className="text-green-600" />
        </div>
        <h2 className="text-2xl font-bold">Deposit in progress!</h2>
        <p className="text-slate-500 text-sm">Once your {momoMethod?.name ?? 'mobile money'} confirms payment, {formatUsdc(netUsdc)} USD will appear in your Olomi Wallet.</p>
        <button onClick={() => router.push('/dashboard')} className="btn-primary w-full">Back to home</button>
      </div>
      <BottomNav />
    </div>
  );

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">Add Money</h1>
      </div>

      {/* Tabs */}
      <div className="flex bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 overflow-x-auto">
        {([
          { id: 'receive', label: '📥 Receive', icon: QrCode },
          { id: 'mobile',  label: '📱 Mobile Money', icon: Smartphone },
          { id: 'bank',    label: '🏦 Bank',          icon: Building2 },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 px-3 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-slate-400'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Receive / QR Code ──────────────────────────────────────────── */}
      {tab === 'receive' && (
        <div className="max-w-md mx-auto px-4 pt-5 space-y-4">
          {rcvLoading ? (
            <div className="flex justify-center py-16"><RefreshCw size={24} className="animate-spin text-primary" /></div>
          ) : (
            <>
              {/* Account status */}
              <div className={`rounded-2xl p-4 flex items-center gap-3 ${
                accountInfo?.funded
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                  : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
              }`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  accountInfo?.funded ? 'bg-green-100' : 'bg-amber-100'
                }`}>
                  <Wallet size={18} className={accountInfo?.funded ? 'text-green-600' : 'text-amber-600'} />
                </div>
                <div className="flex-1">
                  {accountInfo?.funded ? (
                    <>
                      <p className="text-sm font-semibold text-green-700 dark:text-green-400">Wallet Active ✓</p>
                      <p className="text-xs text-green-600">Balance ${parseFloat(accountInfo.usdc).toFixed(2)}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Activate your wallet</p>
                      <p className="text-xs text-amber-600">One tap to get your wallet ready</p>
                    </>
                  )}
                </div>
                {!accountInfo?.funded && (
                  <button onClick={triggerFriendbot} disabled={fundLoading}
                    className="bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl disabled:opacity-60 flex items-center gap-1">
                    {fundLoading ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
                    Activate
                  </button>
                )}
              </div>

              {/* QR Code — single 'receive money' code */}
              <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 flex flex-col items-center gap-5">
                <div>
                  <p className="text-center text-sm font-semibold mb-1">
                    Scan to receive money
                  </p>
                  <p className="text-center text-xs text-slate-400 mb-4">
                    Share this code to get paid instantly
                  </p>
                </div>

                {/* QR Code display */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                  {qrUri && (
                    <QRCodeSVG
                      value={qrUri}
                      size={220}
                      level="M"
                      includeMargin={false}
                      imageSettings={{
                        src: '/logo.svg',
                        x: undefined,
                        y: undefined,
                        height: 32,
                        width: 32,
                        excavate: true,
                      }}
                    />
                  )}
                </div>

                {/* Network badge */}
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                  receiveData?.network === 'testnet'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-green-100 text-green-700'
                }`}>
                  {receiveData?.network === 'testnet' ? '⚠ TESTNET — Not real money' : '✓ MAINNET'}
                </span>

                {/* Address display */}
                <div className="w-full bg-slate-50 dark:bg-slate-700 rounded-2xl p-3">
                  <p className="text-xs text-slate-400 mb-1 text-center">Your Wallet Address</p>
                  <p className="font-mono text-xs text-center break-all text-slate-700 dark:text-slate-300 leading-relaxed">
                    {receiveData?.address}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="grid grid-cols-3 gap-2 w-full">
                  <button onClick={copyAddress}
                    className="flex flex-col items-center gap-1.5 bg-primary/10 text-primary rounded-2xl py-3 px-2">
                    <Copy size={18} />
                    <span className="text-xs font-semibold">Copy</span>
                  </button>
                  <button onClick={shareAddress}
                    className="flex flex-col items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-2xl py-3 px-2">
                    <Share2 size={18} />
                    <span className="text-xs font-semibold">Share</span>
                  </button>
                  <a href={receiveData?.explorerUrl} target="_blank" rel="noopener noreferrer"
                    className="flex flex-col items-center gap-1.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl py-3 px-2">
                    <ExternalLink size={18} />
                    <span className="text-xs font-semibold">Explorer</span>
                  </a>
                </div>
              </div>

              {/* How it works */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 space-y-2">
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">How to receive money</p>
                <ol className="space-y-1.5 text-xs text-blue-600 dark:text-blue-300">
                  <li>1. Share your QR code or address with the sender</li>
                  <li>2. The sender scans the QR with their wallet app</li>
                  <li>3. It auto-fills your address — they just enter amount and send</li>
                  <li>4. Funds arrive in seconds</li>
                </ol>
                <p className="text-xs text-blue-500 mt-2">
                  Works with any compatible wallet app that reads payment QR codes
                </p>
              </div>

              {/* Scan to Send button */}
              <button
                onClick={() => router.push('/scan')}
                className="w-full bg-primary text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-base">
                <QrCode size={20} />
                Scan QR to Send
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Tab: Mobile Money ───────────────────────────────────────────────── */}
      {tab === 'mobile' && momoStep === 'method' && (
        <div className="px-4 max-w-md mx-auto mt-4 space-y-3">
          <p className="text-slate-500 text-sm">Choose your mobile money provider to deposit.</p>
          {MOBILE_MONEY_PROVIDERS.map(p => (
            <button key={p.id} onClick={() => { setMomoMethod(p); setMomoStep('amount'); }}
              className="w-full bg-white dark:bg-slate-800 rounded-2xl p-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-100 dark:border-slate-700 text-left">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0" style={{ backgroundColor: p.color + '20' }}>
                {p.flag}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{p.name}</p>
                <p className="text-xs text-slate-400 truncate">{p.countries}</p>
              </div>
              <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {tab === 'mobile' && momoStep === 'amount' && (
        <div className="px-4 max-w-md mx-auto mt-5 space-y-5">
          <button onClick={() => setMomoStep('method')} className="flex items-center gap-2 text-sm text-slate-400">
            <ArrowLeft size={16} /> {momoMethod?.name}
          </button>
          <div className="card space-y-3">
            <label className="text-sm font-medium text-slate-500">Amount</label>
            <div className="flex items-center gap-3 border-2 border-primary rounded-2xl px-4 min-h-[64px] bg-white dark:bg-slate-800">
              <span className="text-slate-400 font-medium text-sm">Local</span>
              <input type="number" inputMode="numeric" placeholder="0" value={amount}
                onChange={e => setAmount(e.target.value)}
                className="flex-1 bg-transparent text-3xl font-bold outline-none py-3 text-right" min="500" autoFocus />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[5000, 10000, 20000, 50000, 100000, 500000].map(p => (
                <button key={p} onClick={() => setAmount(String(p))}
                  className={`text-sm font-semibold py-2 px-3 rounded-xl min-h-[40px] transition-colors ${
                    amountNum === p ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'
                  }`}>
                  {p >= 1000 ? `${p / 1000}K` : p}
                </button>
              ))}
            </div>
          </div>
          {amountNum >= 500 && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
              <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Full Fee Breakdown</p>
                {rateData?.isSandbox && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">TESTNET — mirrors mainnet fees</span>
                )}
              </div>
              {feePreview ? (
                <div className="px-4 py-3 space-y-2 text-sm">
                  {/* Exchange */}
                  <div className="flex justify-between"><span className="text-slate-500">You pay (M-Pesa)</span><span className="font-semibold">TZS {amountNum.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Exchange rate</span><span>1 USD = TZS {Math.round(feePreview.ycBuyRate).toLocaleString()}</span></div>
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-2" />
                  {/* Platform fee */}
                  <div className="flex justify-between text-amber-600">
                    <span>OlomiPay fee (1%)</span>
                    <span>− ${feePreview.platformFeeUsdc.toFixed(2)}</span>
                  </div>
                  {/* Network fee */}
                  <div className="flex justify-between text-slate-400 text-xs">
                    <span>Network fee</span>
                    <span className="text-green-600 font-medium">Free</span>
                  </div>

                  {/* One-time wallet activation (mainnet first deposit only) */}
                  {feePreview.isFirstDeposit && feePreview.activationFeeUsdc > 0 && (
                    <div className="flex justify-between text-blue-600">
                      <span className="flex items-center gap-1">
                        Wallet activation
                        <span className="text-[9px] bg-blue-100 text-blue-700 px-1 rounded">one-time</span>
                      </span>
                      <span>− ${feePreview.activationFeeUsdc.toFixed(2)}</span>
                    </div>
                  )}

                  {/* Total */}
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between font-bold text-base">
                    <span>You receive</span>
                    <span className="text-green-600">
                      ${(feePreview.netUsdcAfterActivation ?? feePreview.netUsdc).toFixed(2)}
                    </span>
                  </div>

                  {feePreview.isFirstDeposit && feePreview.activationFeeUsdc > 0 && (
                    <p className="text-[11px] text-blue-500 text-center -mt-1">
                      A one-time ${feePreview.activationFeeUsdc.toFixed(2)} activates your wallet — every future deposit has no activation fee.
                    </p>
                  )}
                  <div className="text-xs text-slate-400 text-center">
                    Arrives instantly in your wallet
                  </div>
                </div>
              ) : (
                <div className="px-4 py-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">You pay</span><span className="font-semibold">TZS {amountNum.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Rate (YC)</span><span>1 USD ≈ TZS {Math.round(rate).toLocaleString()}</span></div>
                  <div className="flex justify-between text-amber-600"><span>OlomiPay fee (1%)</span><span>− {formatUsdc(fee)}</span></div>
                  <div className="flex justify-between font-bold border-t pt-2"><span>~You receive</span><span className="text-green-600">{formatUsdc(netUsdc)}</span></div>
                  {feeLoading && <p className="text-xs text-slate-400 text-center animate-pulse">Fetching exact fees...</p>}
                </div>
              )}
            </div>
          )}
          <button onClick={handleDeposit} disabled={amountNum < 500 || loading} className="btn-primary w-full text-base">
            {loading ? 'Sending prompt...' : `Deposit ${amountNum > 0 ? amountNum.toLocaleString() : ''} via ${momoMethod?.name ?? ''}`}
          </button>
        </div>
      )}

      {/* ── Tab: Bank ───────────────────────────────────────────────────────── */}
      {tab === 'bank' && (
        <div className="px-4 max-w-md mx-auto mt-4 space-y-3">
          <p className="text-slate-500 text-sm">Bank transfer deposit — coming soon.</p>
          {BANK_PROVIDERS.map(p => (
            <button key={p.id}
              className="w-full bg-white dark:bg-slate-800 rounded-2xl p-4 flex items-center gap-4 border border-slate-100 dark:border-slate-700 text-left opacity-60">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl flex-shrink-0">{p.flag}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{p.name}</p>
                <p className="text-xs text-slate-400 truncate">{p.desc}</p>
              </div>
              <span className="text-xs bg-slate-100 text-slate-400 px-2 py-1 rounded-full">Soon</span>
            </button>
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
