'use client';

import { useState } from 'react';
import {
  ArrowUpRight, ArrowDownLeft, RefreshCw, DollarSign, X,
  CheckCircle2, Clock, XCircle, ExternalLink, Copy,
} from 'lucide-react';
import { formatUsdc, formatTzs, timeAgo } from '../lib/utils';

interface Transaction {
  id:          string;
  type:        'DEPOSIT' | 'WITHDRAWAL' | 'SEND' | 'RECEIVE' | 'FEE';
  status:      'PENDING' | 'CONFIRMED' | 'FAILED';
  amountUsdc?: number | null;
  amountTzs?:  number | null;
  memo?:       string | null;
  metadata?:   string | null;
  toAddress?:  string | null;
  stellarTxId?: string | null;
  errorMsg?:   string | null;
  createdAt:   string;
}

const TYPE_META: Record<Transaction['type'], {
  label: string; icon: typeof ArrowUpRight; color: string; sign: '+' | '-' | '';
}> = {
  DEPOSIT:    { label: 'Mobile Money Deposit',    icon: ArrowDownLeft, color: 'text-success bg-success/10', sign: '+' },
  WITHDRAWAL: { label: 'Withdraw to Mobile Money', icon: ArrowUpRight,  color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30', sign: '-' },
  SEND:       { label: 'Sent',          icon: ArrowUpRight,  color: 'text-primary bg-primary/10', sign: '-' },
  RECEIVE:    { label: 'Received',       icon: ArrowDownLeft, color: 'text-success bg-success/10', sign: '+' },
  FEE:        { label: 'Platform Fee',   icon: DollarSign,    color: 'text-slate-500 bg-slate-100 dark:bg-slate-700', sign: '-' },
};

const STATUS_CLASS: Record<Transaction['status'], string> = {
  CONFIRMED: 'badge-confirmed', PENDING: 'badge-pending', FAILED: 'badge-failed',
};

/** Use the memo only if it's a clean human label — never raw JSON / huge blobs. */
function cleanMemo(memo?: string | null): string | null {
  if (!memo) return null;
  const m = memo.trim();
  if (!m) return null;
  if (m.startsWith('{') || m.startsWith('[') || m.includes('":')) return null;
  if (m.length > 60) return null;
  return m;
}

function safeParse(s?: string | null): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

export default function TransactionItem({ tx }: { tx: Transaction }) {
  const [open, setOpen] = useState(false);
  const meta   = TYPE_META[tx.type];
  const Icon   = meta.icon;
  const failed = tx.status === 'FAILED';
  const isSent = meta.sign === '-';
  const label  = cleanMemo(tx.memo) ?? meta.label;

  // FAILED transfers never show a positive credit
  const sign = failed ? '' : meta.sign;
  const primaryAmount = tx.amountUsdc != null
    ? `${sign}${formatUsdc(tx.amountUsdc)}`
    : tx.amountTzs != null
    ? `${sign}${formatTzs(tx.amountTzs)}`
    : '—';

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex w-full items-center gap-4 py-3 px-1 border-b border-slate-100 dark:border-slate-800 last:border-0 text-left active:bg-slate-50 dark:active:bg-slate-800/40 rounded-lg transition-colors">
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${meta.color} ${failed ? 'opacity-50' : ''}`}>
          <Icon size={18} strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{label}</p>
            <span className={STATUS_CLASS[tx.status]}>{tx.status}</span>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{timeAgo(tx.createdAt)}</p>
        </div>
        <div className={`text-sm font-semibold flex-shrink-0 ${
          failed ? 'text-slate-400 line-through'
          : isSent ? 'text-slate-700 dark:text-slate-300'
          : 'text-success'
        }`}>
          {primaryAmount}
        </div>
      </button>

      {open && <DetailSheet tx={tx} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

// ── Detail sheet ────────────────────────────────────────────────────────────────
function DetailSheet({ tx, label, onClose }: { tx: Transaction; label: string; onClose: () => void }) {
  const meta = TYPE_META[tx.type];
  const me:any = safeParse(tx.metadata);
  const fees = me?.fees ?? me?.fees ?? null;

  const StatusIcon = tx.status === 'CONFIRMED' ? CheckCircle2 : tx.status === 'PENDING' ? Clock : XCircle;
  const statusColor = tx.status === 'CONFIRMED' ? 'text-success' : tx.status === 'PENDING' ? 'text-amber-500' : 'text-danger';

  const network = me?.fees?.isTestnet === false ? 'public' : 'testnet';
  const explorer = tx.stellarTxId ? `https://stellar.expert/explorer/${network}/tx/${tx.stellarTxId}` : null;

  const Row = ({ label: l, value, accent }: { label: string; value: string; accent?: string }) => (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-slate-500">{l}</span>
      <span className={`text-sm font-medium ${accent ?? 'text-slate-800 dark:text-slate-200'}`}>{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative rounded-t-[2rem] bg-white dark:bg-slate-900 p-5 pb-10 shadow-2xl max-h-[85vh] overflow-y-auto thin-scroll">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
        <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-slate-100 dark:bg-slate-800 p-2"><X size={16} /></button>

        {/* Hero */}
        <div className="flex flex-col items-center text-center mb-5">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${meta.color}`}>
            <StatusIcon size={26} className={statusColor} />
          </div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="text-3xl font-bold mt-1">
            {tx.amountUsdc != null ? formatUsdc(tx.amountUsdc) : tx.amountTzs != null ? formatTzs(tx.amountTzs) : '—'}
          </p>
          <span className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold ${statusColor}`}>
            <StatusIcon size={13} /> {tx.status}
          </span>
        </div>

        {/* Fee breakdown (from metadata) */}
        {fees && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden mb-4">
            <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2 border-b border-slate-200 dark:border-slate-700">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Fee breakdown</p>
            </div>
            <div className="px-4 py-2">
              {fees.localAmount != null && (
                <Row label={`Amount (${fees.localCurrency ?? 'local'})`} value={Number(fees.localAmount).toLocaleString()} />
              )}
              {fees.midRate != null && <Row label="Exchange rate" value={`1 USD ≈ ${Number(fees.ycBuyRate ?? fees.midRate).toLocaleString()}`} />}
              {fees.grossUsdc != null && <Row label="Gross" value={`$${Number(fees.grossUsdc).toFixed(2)}`} />}
              {fees.platformFeeUsdc != null && <Row label={`OlomiPay fee (${fees.platformFeePct ?? 1}%)`} value={`− $${Number(fees.platformFeeUsdc).toFixed(4)}`} accent="text-amber-600" />}
              {fees.stellarFeeUsd != null && <Row label="Network fee" value={Number(fees.stellarFeeUsd) < 0.01 ? 'Free' : `$${Number(fees.stellarFeeUsd).toFixed(4)}`} accent="text-green-600" />}
              <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
              {fees.netUsdc != null && <Row label="Net received" value={`$${Number(fees.netUsdc).toFixed(2)}`} accent="text-success font-bold" />}
            </div>
          </div>
        )}

        {/* Meta details */}
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 px-4 py-2 mb-4">
          <Row label="Date" value={new Date(tx.createdAt).toLocaleString()} />
          {(me?.channelName || fees?.channelName) && <Row label="Channel" value={me?.channelName ?? fees?.channelName} />}
          {(me?.provider || fees?.provider) && <Row label="Provider" value={(me?.provider ?? fees?.provider).replace(/_/g, ' ')} />}
          {tx.toAddress && <Row label="To" value={`${tx.toAddress.slice(0, 6)}…${tx.toAddress.slice(-4)}`} />}
          {tx.errorMsg && <Row label="Reason" value={tx.errorMsg} accent="text-danger" />}
        </div>

        {/* Receipt actions */}
        <div className="flex gap-2">
          {explorer && (
            <a href={explorer} target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 bg-primary/10 text-primary text-sm font-semibold py-3 rounded-xl">
              <ExternalLink size={14} /> View receipt
            </a>
          )}
          <button onClick={() => { navigator.clipboard.writeText(tx.stellarTxId ?? tx.id); }}
            className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-semibold py-3 rounded-xl">
            <Copy size={14} /> Copy ID
          </button>
        </div>
      </div>
    </div>
  );
}
