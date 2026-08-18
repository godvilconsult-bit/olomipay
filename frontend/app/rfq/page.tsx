'use client';

/**
 * Request for quotation — buyers post requirements, sellers bid.
 *
 * The catalog answers "I know what I want and who sells it". This answers
 * "here is my requirement, who can meet it", which is how most wholesale trade
 * starts. Shaped like the freight board on purpose: same mechanic, products
 * instead of cargo, and the same underlying Quote model.
 */
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FileText, Plus, Clock, BadgeCheck, Gavel, CheckCircle2 } from 'lucide-react';
import { rfq, ApiError, type Rfq, type RfqQuote } from '../../lib/api';
import { formatMoney } from '../../lib/money';
import { Button, Card, Field, Spinner, EmptyState, Pill, cn } from '../../components/ui';
import AppShell from '../../components/AppShell';
import { useT } from '../../lib/i18n';

const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5));

export default function RfqPage() {
  const { t } = useT();
  const [tab, setTab]   = useState<'open' | 'mine'>('open');
  const [open, setOpen] = useState<Rfq[]>([]);
  const [mine, setMine] = useState<Rfq[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  async function refresh() {
    const [a, b] = await Promise.all([
      rfq.list().then(r => r.rfqs).catch(() => []),
      rfq.list({ mine: true }).then(r => r.rfqs).catch(() => []),
    ]);
    setOpen(a); setMine(b);
  }
  useEffect(() => { refresh().finally(() => setLoading(false)); }, []);

  if (loading) return <Spinner />;
  const rows = tab === 'open' ? open : mine;

  return (
    <AppShell title={t('Requests for quotation', 'Maombi ya bei')} subtitle={t('Post what you need', 'Weka unachohitaji')}>
      <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">
        <p className="text-sm text-ink/60 dark:text-sand/60">
          {t('Describe what you need and let sellers come to you with prices.',
             'Eleza unachohitaji na wauzaji watakuletea bei.')}
        </p>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <Pill active={tab === 'open'} onClick={() => setTab('open')}>
            {t('Open requests', 'Maombi wazi')} ({open.length})
          </Pill>
          <Pill active={tab === 'mine'} onClick={() => setTab('mine')}>
            {t('My requests', 'Yangu')} ({mine.length})
          </Pill>
        </div>

        {tab === 'mine' && !showForm && (
          <Button className="mt-3 w-full" onClick={() => setShowForm(true)}>
            <Plus size={16} /> {t('Post a request', 'Weka ombi')}
          </Button>
        )}
        {tab === 'mine' && showForm && (
          <PostRfqForm onCancel={() => setShowForm(false)}
            onPosted={async () => { setShowForm(false); await refresh(); }} />
        )}

        {rows.length === 0 ? (
          <EmptyState
            icon={<FileText size={40} />}
            title={tab === 'open'
              ? t('No open requests right now', 'Hakuna maombi kwa sasa')
              : t('You have not posted a request', 'Hujaweka ombi lolote')}
            sub={t('Sellers bid, you pick the best.', 'Wauzaji hutoa bei, wewe huchagua.')}
          />
        ) : (
          <div className="mt-4 space-y-2">
            {rows.map(r => <RfqCard key={r.id} row={r} mine={tab === 'mine'} onChanged={refresh} />)}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function RfqCard({ row, mine, onChanged }: { row: Rfq; mine: boolean; onChanged: () => void }) {
  const { t } = useT();
  const [bidding, setBidding] = useState(false);
  const [amount, setAmount] = useState('');
  const [lead, setLead] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [quotes, setQuotes] = useState<RfqQuote[] | null>(null);

  const left = daysLeft(row.closesAt);
  const awarded = row.status === 'AWARDED';

  async function submitBid() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return toast.error(t('Enter your price', 'Weka bei yako'));
    setBusy(true);
    try {
      await rfq.quote(row.id, { amount: value, leadDays: Number(lead) || undefined, message: note.trim() || undefined });
      toast.success(t('Quote sent', 'Bei imetumwa'));
      setBidding(false); setAmount(''); setLead(''); setNote('');
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('Could not send the quote', 'Imeshindwa kutuma'));
    } finally { setBusy(false); }
  }

  async function award(quoteId: string) {
    setBusy(true);
    try {
      await rfq.award(quoteId);
      toast.success(t('Awarded', 'Imekubaliwa'));
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('Could not award', 'Imeshindwa'));
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-ink dark:text-sand">{row.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink/55">
            <span>{row.qty.toLocaleString()} {row.unit ?? row.category?.unitType ?? ''}</span>
            {row.category?.name && <span>· {row.category.name}</span>}
            <span className="inline-flex items-center gap-1"><Clock size={11} /> {left} {t('days left', 'siku zimebaki')}</span>
            {!mine && row.buyer && (
              <span className="inline-flex items-center gap-1">
                {row.buyer.name}
                {row.buyer.isVerified && <BadgeCheck size={11} className="text-leaf-dark" />}
              </span>
            )}
          </div>
        </div>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
          awarded ? 'bg-leaf/15 text-leaf-dark' : 'bg-amber-100 text-amber-700')}>{row.status}</span>
      </div>

      {row.spec && <p className="mt-2 whitespace-pre-line text-xs text-ink/60 dark:text-sand/60">{row.spec}</p>}
      {row.target != null && (
        <div className="mt-1.5 text-xs text-ink/50">
          {t('Target budget', 'Bajeti')}: {formatMoney(row.target, row.currency)}
        </div>
      )}

      {/* Seller side */}
      {!mine && !awarded && (bidding ? (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('Your price', 'Bei yako')} type="number" inputMode="decimal"
              value={amount} onChange={e => setAmount(e.target.value)} />
            <Field label={t('Lead time (days)', 'Siku za kuandaa')} type="number" inputMode="numeric"
              value={lead} onChange={e => setLead(e.target.value)} />
          </div>
          <Field label={t('Message (optional)', 'Ujumbe (hiari)')} value={note} onChange={e => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button className="flex-1" loading={busy} onClick={submitBid}>{t('Send quote', 'Tuma bei')}</Button>
            <Button variant="ghost" onClick={() => setBidding(false)}>{t('Cancel', 'Ghairi')}</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" className="mt-3 w-full" onClick={() => setBidding(true)}>
          <Gavel size={15} /> {t('Quote on this request', 'Toa bei')}
        </Button>
      ))}

      {/* Buyer side. The bid book is buyer-only by design — a seller seeing
          rivals' prices turns the board into a price-fixing signal. */}
      {mine && (
        <div className="mt-3">
          {quotes === null ? (
            <Button variant="ghost" className="w-full"
              onClick={async () => {
                try { setQuotes((await rfq.get(row.id)).rfq.quotes ?? []); }
                catch { toast.error(t('Could not load quotes', 'Imeshindwa kupakia')); }
              }}>
              {t('See quotes', 'Ona bei')} {row._count?.quotes ? `(${row._count.quotes})` : ''}
            </Button>
          ) : quotes.length === 0 ? (
            <p className="text-center text-xs text-ink/45">{t('No quotes yet', 'Hakuna bei bado')}</p>
          ) : (
            <div className="space-y-1.5">
              {quotes.map(q => (
                <div key={q.id} className="flex items-center gap-2 rounded-xl bg-black/5 p-2 dark:bg-white/5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 truncate text-sm font-semibold text-ink dark:text-sand">
                      {q.bidder?.name ?? t('Seller', 'Muuzaji')}
                      {q.bidder?.isVerified && <BadgeCheck size={12} className="shrink-0 text-leaf-dark" />}
                    </div>
                    {q.message && <div className="truncate text-[11px] text-ink/50">{q.message}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-bold tabular-nums text-flame">{formatMoney(q.amount, q.currency)}</div>
                    {!awarded && q.status === 'PENDING' && (
                      <button onClick={() => award(q.id)} disabled={busy}
                        className="text-[11px] font-semibold text-leaf-dark hover:underline">
                        {t('Accept', 'Kubali')}
                      </button>
                    )}
                    {q.status === 'ACCEPTED' && (
                      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-leaf-dark">
                        <CheckCircle2 size={11} /> {t('Awarded', 'Imekubaliwa')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function PostRfqForm({ onCancel, onPosted }: { onCancel: () => void; onPosted: () => void }) {
  const { t } = useT();
  const [f, setF] = useState({ title: '', qty: '1', unit: '', spec: '', target: '', closesInDays: '14' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: any) => setF(s => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.title.trim().length < 3) return toast.error(t('Describe what you need', 'Eleza unachohitaji'));
    setBusy(true);
    try {
      await rfq.create({
        title: f.title.trim(),
        qty: Math.max(1, Number(f.qty) || 1),
        unit: f.unit.trim() || undefined,
        spec: f.spec.trim() || undefined,
        target: Number(f.target) > 0 ? Number(f.target) : undefined,
        closesInDays: Math.max(1, Number(f.closesInDays) || 14),
      });
      toast.success(t('Request posted', 'Ombi limewekwa'));
      onPosted();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('Could not post', 'Imeshindwa'));
    } finally { setBusy(false); }
  }

  return (
    <Card className="mt-3">
      <form onSubmit={submit} className="space-y-3">
        <Field label={t('What do you need?', 'Unahitaji nini?')}
          placeholder={t('e.g. 500 bags of Portland cement', 'mfano: mifuko 500 ya simenti')}
          value={f.title} onChange={set('title')} />
        <div className="grid grid-cols-3 gap-2">
          <Field label={t('Quantity', 'Idadi')} type="number" inputMode="numeric" value={f.qty} onChange={set('qty')} />
          <Field label={t('Unit', 'Kipimo')} placeholder="bag, kg…" value={f.unit} onChange={set('unit')} />
          <Field label={t('Closes in (days)', 'Inafunga (siku)')} type="number" inputMode="numeric"
            value={f.closesInDays} onChange={set('closesInDays')} />
        </div>
        <Field label={t('Target budget (optional)', 'Bajeti (hiari)')} type="number" inputMode="decimal"
          value={f.target} onChange={set('target')} />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink/70 dark:text-sand/70">
            {t('Specification (optional)', 'Maelezo (hiari)')}
          </span>
          <textarea rows={3} value={f.spec} onChange={set('spec')} maxLength={4000}
            placeholder={t('Grade, delivery location, timing…', 'Ubora, mahali, muda…')}
            className="w-full rounded-2xl border border-black/10 bg-white p-3 text-ink outline-none focus:border-flame dark:border-white/10 dark:bg-ink-2 dark:text-sand" />
        </label>
        <div className="flex gap-2">
          <Button type="submit" loading={busy} className="flex-1">{t('Post request', 'Weka ombi')}</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>{t('Cancel', 'Ghairi')}</Button>
        </div>
      </form>
    </Card>
  );
}
