'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, QrCode, CheckCircle2, ExternalLink } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import PinInput from '../../components/PinInput';
import FeePreview from '../../components/FeePreview';
import { send } from '../../lib/api';
import { parseRecipient, parseAmount, calcFee, isValidStellarAddress } from '../../lib/utils';

const API = process.env.NEXT_PUBLIC_API_URL;
function getToken() {
  return sessionStorage.getItem('olomipay_at') || (sessionStorage.getItem('olomipay_at') || sessionStorage.getItem('olomipay_rt')) || '';
}

type Step = 'form' | 'pin' | 'success';

function SendPageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [step,      setStep]      = useState<Step>('form');
  const [recipient, setRecipient] = useState('');
  const [amount,    setAmount]    = useState('');
  const [asset,     setAsset]     = useState<'USDC' | 'XLM'>('XLM');
  const [memo,      setMemo]      = useState('');
  const [pin,       setPin]       = useState('');
  const [loading,   setLoading]   = useState(false);
  const [txHash,    setTxHash]    = useState('');
  const [isTestnet, setIsTestnet] = useState(true);

  // Pre-fill from QR scan params
  useEffect(() => {
    const to     = searchParams.get('to');
    const amt    = searchParams.get('amount');
    const ast    = searchParams.get('asset');
    const m      = searchParams.get('memo');
    if (to)  setRecipient(to);
    if (amt) setAmount(amt);
    if (ast) setAsset(ast.toUpperCase() as 'XLM' | 'USDC');
    if (m)   setMemo(m);
  }, [searchParams]);

  const recipientType = parseRecipient(recipient);
  const amountNum     = parseAmount(amount);
  const { fee, net }  = calcFee(amountNum);
  const canProceed    = amountNum > 0 && recipientType !== 'unknown';

  async function handleSend() {
    if (pin.length < 6) { toast.error('Enter your PIN'); return; }
    setLoading(true);
    try {
      let result: any;
      if (asset === 'XLM') {
        // Direct XLM send
        const r = await fetch(`${API}/api/send/xlm`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body:    JSON.stringify({ toAddress: recipient, amount: amountNum, memo, pin }),
        });
        result = await r.json();
        if (!result.success && result.error) throw new Error(result.error);
        setTxHash(result.hash ?? '');
      } else if (recipientType === 'phone') {
        result = await send.toPhone({ toPhone: recipient, amount: amountNum, asset, pin });
        setTxHash(result.hash ?? '');
      } else {
        result = await send.toAddress({ toAddress: recipient, amount: amountNum, asset, memo, pin });
        setTxHash(result.hash ?? result.transactionId ?? '');
      }
      setStep('success');
    } catch (err: any) {
      toast.error(err.message ?? 'Transfer failed');
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center px-5 pb-24">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={40} className="text-success" />
          </div>
          <h2 className="text-2xl font-bold">Sent!</h2>
          <p className="text-slate-500 text-sm">
            {net.toFixed(2)} {asset} sent to {recipient.length > 20
              ? recipient.slice(0, 8) + '...' + recipient.slice(-4)
              : recipient}
          </p>
          {txHash && (
            <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-3 space-y-2">
              <p className="text-xs text-slate-400 font-mono break-all">{txHash}</p>
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 text-xs text-primary font-semibold">
                <ExternalLink size={12} /> View on Stellar Explorer
              </a>
            </div>
          )}
          <div className="flex flex-col gap-3">
            <button onClick={() => router.push('/dashboard')} className="btn-primary w-full">
              Back to home
            </button>
            <button onClick={() => { setStep('form'); setPin(''); setAmount(''); setRecipient(''); }} className="btn-secondary w-full">
              Send again
            </button>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
        <button onClick={() => step === 'pin' ? setStep('form') : router.back()}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">{step === 'pin' ? 'Confirm with PIN' : 'Send money'}</h1>
      </div>

      <div className="px-5 max-w-md mx-auto mt-4 space-y-4">
        {step === 'form' && (
          <>
            {/* Recipient */}
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400">To</label>
                <button onClick={() => router.push('/scan')}
                  className="flex items-center gap-1.5 text-xs text-primary font-semibold bg-primary/10 px-3 py-1.5 rounded-xl">
                  <QrCode size={13} /> Scan QR
                </button>
              </div>
              <input
                type="text"
                placeholder="+255712345678 or G... Stellar address"
                value={recipient}
                onChange={e => setRecipient(e.target.value.trim())}
                className="input"
                autoFocus
              />
              {recipient.length > 5 && (
                <p className={`text-xs font-medium ${
                  recipientType === 'unknown'
                    ? 'text-danger'
                    : 'text-success'
                }`}>
                  {recipientType === 'phone'    ? '✓ Tanzania phone number' :
                   recipientType === 'stellar'  ? '✓ Valid wallet address' :
                   '✗ Not a valid phone or wallet address'}
                </p>
              )}
            </div>

            {/* Amount + asset */}
            <div className="card space-y-3">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Amount</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="input flex-1 text-2xl font-bold"
                  min="0"
                />
                <select
                  value={asset}
                  onChange={e => setAsset(e.target.value as 'USDC' | 'XLM')}
                  className="input w-28 font-semibold"
                >
                  <option value="USDC">USDC</option>
                  <option value="XLM">XLM</option>
                </select>
              </div>
            </div>

            {/* Memo */}
            <div className="card">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400 block mb-2">
                Note (optional)
              </label>
              <input
                type="text"
                placeholder="What's this for?"
                value={memo}
                onChange={e => setMemo(e.target.value)}
                className="input"
                maxLength={28}
              />
            </div>

            {/* Fee preview */}
            {amountNum > 0 && (
              <FeePreview grossAmount={amountNum} asset={asset} fee={fee} net={net} />
            )}

            <button
              onClick={() => setStep('pin')}
              disabled={!canProceed}
              className="btn-primary w-full text-base"
            >
              Continue
            </button>
          </>
        )}

        {step === 'pin' && (
          <div className="flex flex-col items-center gap-6 mt-8">
            {/* Summary */}
            <div className="card w-full text-center">
              <p className="text-sm text-slate-500 mb-1">Sending</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">
                {net.toFixed(2)} {asset}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                to {recipient.length > 20
                  ? recipient.slice(0, 8) + '…' + recipient.slice(-4)
                  : recipient}
              </p>
              <p className="text-xs text-slate-400 mt-3">
                Fee: {fee.toFixed(4)} {asset} (1%)
              </p>
            </div>

            <p className="text-sm text-slate-500">Enter PIN to authorise</p>
            <PinInput value={pin} onChange={setPin} autoFocus />

            <button
              onClick={handleSend}
              disabled={pin.length < 6 || loading}
              className="btn-primary w-full text-base"
            >
              {loading ? 'Sending…' : `Send ${net.toFixed(2)} ${asset}`}
            </button>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

export default function SendPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    }>
      <SendPageInner />
    </Suspense>
  );
}
