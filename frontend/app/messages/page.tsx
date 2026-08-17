'use client';

/**
 * Conversation list — every thread this organization is part of, as buyer or
 * as seller.
 *
 * Shows the counterparty rather than "buyer/seller", because which side you are
 * on changes per thread: a shop buys from a wholesaler in one and sells to a
 * household in the next.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageSquare, Store, Receipt, ChevronRight } from 'lucide-react';
import { messaging, type ConversationSummary } from '../../lib/api';
import { Card, Spinner, EmptyState, cn } from '../../components/ui';
import AppShell from '../../components/AppShell';
import { useT } from '../../lib/i18n';

function timeAgo(iso: string, t: (en: string, sw: string) => string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1)     return t('just now', 'sasa hivi');
  if (mins < 60)    return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)     return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function MessagesPage() {
  const { t } = useT();
  const [rows, setRows] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    messaging.list()
      .then(r => setRows(r.conversations))
      .catch(() => setError(t('Could not load your messages.', 'Imeshindwa kupakia ujumbe.')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <Spinner />;

  return (
    <AppShell
      title={t('Messages', 'Ujumbe')}
      subtitle={t('Buyers and sellers', 'Wanunuzi na wauzaji')}
    >
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-4">
      <p className="text-sm text-ink/60 dark:text-sand/60">
        {t('Talk to sellers and buyers before you order.', 'Ongea na wauzaji na wanunuzi kabla ya kuagiza.')}
      </p>

      {error ? (
        <Card className="mt-4"><p className="py-6 text-center text-sm text-ink/60">{error}</p></Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<MessageSquare size={40} />}
          title={t('No conversations yet', 'Hakuna mazungumzo bado')}
          sub={t('Open any product and tap “Message seller” to start one.', 'Fungua bidhaa yoyote na ubonyeze “Tuma ujumbe” kuanza.')}
        />
      ) : (
        <div className="mt-4 space-y-2">
          {rows.map(c => (
            <Link key={c.id} href={`/messages/${c.id}`} className="block">
              <Card className="flex items-center gap-3 transition hover:shadow-lg">
                <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
                  {c.product?.imageUrl
                    ? <img src={c.product.imageUrl} alt="" className="h-full w-full object-cover" />
                    : <Store className="text-ink/30" size={18} />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn('truncate', c.unread ? 'font-extrabold text-ink dark:text-sand' : 'font-semibold text-ink/90 dark:text-sand/90')}>
                      {c.counterparty?.name ?? t('Unknown', 'Haijulikani')}
                    </span>
                    {c.iAmSeller && (
                      <span className="shrink-0 rounded-full bg-flame/10 px-1.5 py-0.5 text-[9px] font-bold text-flame">
                        {t('BUYER', 'MNUNUZI')}
                      </span>
                    )}
                    {c.status === 'AGREED' && (
                      <span className="shrink-0 rounded-full bg-leaf/15 px-1.5 py-0.5 text-[9px] font-bold text-leaf-dark">
                        {t('AGREED', 'IMEKUBALIWA')}
                      </span>
                    )}
                  </div>

                  {c.product?.name && <div className="truncate text-[11px] text-ink/45">{c.product.name}</div>}
                  {c.lastMessage && (
                    <div className={cn('truncate text-xs', c.unread ? 'text-ink/80 dark:text-sand/80' : 'text-ink/50')}>
                      {c.lastMessage.body}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[10px] text-ink/40">{timeAgo(c.lastMessageAt, t)}</span>
                  {c.invoiceCount > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-flame">
                      <Receipt size={10} /> {c.invoiceCount}
                    </span>
                  )}
                  {c.unread && <span className="h-2 w-2 rounded-full bg-flame" />}
                </div>

                <ChevronRight size={16} className="shrink-0 text-ink/25" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
    </AppShell>
  );
}
