'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Filter } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import TransactionItem from '../../components/TransactionItem';
import { wallet } from '../../lib/api';

type FilterType = 'ALL' | 'DEPOSIT' | 'WITHDRAWAL' | 'SEND' | 'RECEIVE';

const FILTERS: { label: string; value: FilterType }[] = [
  { label: 'All',      value: 'ALL'        },
  { label: 'Deposits', value: 'DEPOSIT'    },
  { label: 'Sent',     value: 'SEND'       },
  { label: 'Received', value: 'RECEIVE'    },
  { label: 'Withdraw', value: 'WITHDRAWAL' },
];

export default function HistoryPage() {
  const router = useRouter();
  const [txs,     setTxs]     = useState<any[]>([]);
  const [filter,  setFilter]  = useState<FilterType>('ALL');
  const [loading, setLoading] = useState(true);
  const [total,   setTotal]   = useState(0);
  const [offset,  setOffset]  = useState(0);
  const LIMIT = 20;

  const load = useCallback(async (reset = false) => {
    const off = reset ? 0 : offset;
    setLoading(true);
    try {
      const res = await wallet.history(LIMIT, off);
      const incoming = res.transactions ?? [];
      setTxs(prev => reset ? incoming : [...prev, ...incoming]);
      setTotal(res.total);
      if (!reset) setOffset(off + incoming.length);
    } catch {
      router.replace('/auth/login');
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => { load(true); }, []);

  const filtered = filter === 'ALL' ? txs : txs.filter(t => t.type === filter);

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3 px-5 py-4">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold flex-1">Transaction history</h1>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 px-5 pb-3 overflow-x-auto scrollbar-none">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors min-h-[36px] ${
                filter === f.value
                  ? 'chip-active'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 max-w-md mx-auto mt-4">
        {loading && txs.length === 0 ? (
          <div className="card space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex gap-3 items-center">
                <div className="skeleton w-10 h-10 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-36" />
                  <div className="skeleton h-3 w-24" />
                </div>
                <div className="skeleton h-4 w-16" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-4xl mb-3">📂</p>
            <p className="font-medium">No transactions</p>
            <p className="text-sm mt-1 text-slate-400">
              {filter === 'ALL' ? 'Make your first deposit to get started.' : `No ${filter.toLowerCase()} transactions yet.`}
            </p>
          </div>
        ) : (
          <div className="card">
            {filtered.map(tx => <TransactionItem key={tx.id} tx={tx} />)}
          </div>
        )}

        {/* Load more */}
        {!loading && txs.length < total && (
          <button
            onClick={() => load()}
            className="w-full text-sm text-primary font-medium py-4 min-h-[48px]"
          >
            Load more
          </button>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
