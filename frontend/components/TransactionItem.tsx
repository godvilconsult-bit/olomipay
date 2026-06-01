import { ArrowUpRight, ArrowDownLeft, RefreshCw, DollarSign } from 'lucide-react';
import { formatUsdc, formatTzs, timeAgo } from '../lib/utils';

interface Transaction {
  id:          string;
  type:        'DEPOSIT' | 'WITHDRAWAL' | 'SEND' | 'RECEIVE' | 'FEE';
  status:      'PENDING' | 'CONFIRMED' | 'FAILED';
  amountUsdc?: number | null;
  amountTzs?:  number | null;
  memo?:       string | null;
  toAddress?:  string | null;
  createdAt:   string;
}

const TYPE_META: Record<Transaction['type'], {
  label: string;
  icon:  typeof ArrowUpRight;
  color: string;
  sign:  '+' | '-' | '';
}> = {
  DEPOSIT:    { label: 'Mobile Money Deposit',  icon: ArrowDownLeft,  color: 'text-success bg-success/10', sign: '+' },
  WITHDRAWAL: { label: 'Withdraw to Mobile Money', icon: ArrowUpRight, color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30', sign: '-' },
  SEND:       { label: 'Sent',            icon: ArrowUpRight,   color: 'text-primary bg-primary/10',  sign: '-' },
  RECEIVE:    { label: 'Received',        icon: ArrowDownLeft,  color: 'text-success bg-success/10',  sign: '+' },
  FEE:        { label: 'Platform Fee',    icon: DollarSign,     color: 'text-slate-500 bg-slate-100 dark:bg-slate-700', sign: '-' },
};

const STATUS_CLASS: Record<Transaction['status'], string> = {
  CONFIRMED: 'badge-confirmed',
  PENDING:   'badge-pending',
  FAILED:    'badge-failed',
};

interface Props {
  tx: Transaction;
}

/** Use the memo only if it's a clean human label — never raw JSON / huge blobs. */
function cleanMemo(memo?: string | null): string | null {
  if (!memo) return null;
  const m = memo.trim();
  if (!m) return null;
  // Looks like JSON or a serialized object/array — ignore it
  if (m.startsWith('{') || m.startsWith('[') || m.includes('":')) return null;
  // Unreasonably long for a label — ignore
  if (m.length > 60) return null;
  return m;
}

export default function TransactionItem({ tx }: Props) {
  const meta  = TYPE_META[tx.type];
  const Icon  = meta.icon;
  const isSent = meta.sign === '-';
  const label = cleanMemo(tx.memo) ?? meta.label;

  const primaryAmount = tx.amountUsdc != null
    ? `${meta.sign}${formatUsdc(tx.amountUsdc)}`
    : tx.amountTzs != null
    ? `${meta.sign}${formatTzs(tx.amountTzs)}`
    : '—';

  return (
    <div className="flex items-center gap-4 py-3 px-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
      {/* Icon */}
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${meta.color}`}>
        <Icon size={18} strokeWidth={2} />
      </div>

      {/* Description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
            {label}
          </p>
          <span className={STATUS_CLASS[tx.status]}>{tx.status}</span>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          {timeAgo(tx.createdAt)}
        </p>
      </div>

      {/* Amount */}
      <div className={`text-sm font-semibold flex-shrink-0 ${
        isSent ? 'text-slate-700 dark:text-slate-300' : 'text-success'
      }`}>
        {primaryAmount}
      </div>
    </div>
  );
}
