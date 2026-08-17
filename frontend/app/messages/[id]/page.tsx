'use client';

/**
 * A conversation: messages, the moment terms are agreed, and the invoice that
 * follows.
 *
 * The invoice builder is only offered to the seller, and only once the thread
 * is marked agreed — an invoice is the record of something settled, not an
 * opening move.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Send, Receipt, CheckCircle2, Plus, Trash2, BadgeCheck } from 'lucide-react';
import {
  messaging, invoicesApi, ApiError,
  type ChatMsg, type Invoice,
} from '../../../lib/api';
import { formatMoney, formatMinor } from '../../../lib/money';
import { Button, Card, Field, Spinner, cn } from '../../../components/ui';
import { useT } from '../../../lib/i18n';

interface Head {
  id: string; status: string; subject?: string | null;
  product?: { id: string; name: string; imageUrl?: string | null } | null;
  counterparty: { id: string; name: string; slug: string };
  iAmSeller: boolean;
}

export default function ThreadPage() {
  const { t } = useT();
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  const [head, setHead]         = useState<Head | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [me, setMe]             = useState('');
  const [text, setText]         = useState('');
  const [loading, setLoading]   = useState(true);
  const [sending, setSending]   = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  async function load(scroll = false) {
    try {
      const r = await messaging.thread(id);
      setHead(r.conversation as Head);
      setMessages(r.messages);
      setInvoices(r.invoices);
      setMe(r.me);
      if (scroll) setTimeout(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('Could not open this conversation', 'Imeshindwa kufungua mazungumzo'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    load(true);
    // Light poll keeps the thread current without wiring a socket listener into
    // this screen; the interval is generous because chat here is not real-time
    // critical the way rider tracking is.
    const timer = setInterval(() => load(false), 15_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setText('');
    try {
      await messaging.send(id, body);
      await load(true);
    } catch (err) {
      setText(body);   // put it back rather than losing what they typed
      toast.error(err instanceof ApiError ? err.message : t('Message not sent', 'Ujumbe haujatumwa'));
    } finally {
      setSending(false);
    }
  }

  async function agree() {
    try {
      await messaging.agree(id);
      toast.success(t('Marked as agreed', 'Imewekwa kama makubaliano'));
      await load();
    } catch { toast.error(t('Could not update', 'Imeshindwa')); }
  }

  async function markPaid(invoiceId: string) {
    try {
      await invoicesApi.markPaid(invoiceId);
      toast.success(t('Payment confirmed', 'Malipo yamethibitishwa'));
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('Could not confirm', 'Imeshindwa'));
    }
  }

  if (loading) return <Spinner />;
  if (!head)   return <div className="p-8 text-center text-sm text-ink/60">{t('Conversation not found', 'Mazungumzo hayapo')}</div>;

  const agreed = head.status === 'AGREED';

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 pb-28 pt-4">
      {/* Header */}
      <div className="mb-3 flex items-center gap-3">
        <Link href="/messages" aria-label={t('Back', 'Rudi')} className="text-ink/60 hover:text-flame">
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold text-ink dark:text-sand">{head.counterparty?.name}</div>
          {head.product?.name && (
            <Link href={`/shop/p/${head.product.id}`} className="truncate text-xs text-flame">
              {head.product.name}
            </Link>
          )}
        </div>
        {agreed && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-leaf/15 px-2 py-1 text-[10px] font-bold text-leaf-dark">
            <BadgeCheck size={11} /> {t('AGREED', 'IMEKUBALIWA')}
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-2">
        {messages.map(m => {
          const mine = m.senderUserId === me;
          return (
            <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[78%] rounded-2xl px-3.5 py-2 text-sm',
                mine ? 'bg-grad-brand text-white' : 'bg-white text-ink dark:bg-ink-2 dark:text-sand',
              )}>
                <div className="whitespace-pre-line break-words">{m.body}</div>
                <div className={cn('mt-0.5 text-[10px]', mine ? 'text-white/70' : 'text-ink/40')}>
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}

        {invoices.map(inv => (
          <InvoiceCard key={inv.id} invoice={inv} iAmSeller={head.iAmSeller} onMarkPaid={() => markPaid(inv.id)} />
        ))}
        <div ref={bottom} />
      </div>

      {/* Actions */}
      <div className="mt-4 space-y-3">
        {!agreed && (
          <Button variant="ghost" className="w-full" onClick={agree}>
            <CheckCircle2 size={16} /> {t('We have agreed terms', 'Tumekubaliana')}
          </Button>
        )}

        {head.iAmSeller && agreed && !showInvoice && (
          <Button variant="leaf" className="w-full" onClick={() => setShowInvoice(true)}>
            <Receipt size={16} /> {t('Create invoice', 'Tengeneza ankara')}
          </Button>
        )}

        {head.iAmSeller && showInvoice && (
          <InvoiceBuilder
            conversationId={id}
            onCancel={() => setShowInvoice(false)}
            onCreated={async () => { setShowInvoice(false); await load(true); }}
          />
        )}

        <form onSubmit={send} className="flex gap-2">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t('Write a message…', 'Andika ujumbe…')}
            aria-label={t('Message', 'Ujumbe')}
            className="min-h-touch flex-1 rounded-2xl border border-black/10 bg-white px-4 text-ink outline-none focus:border-flame dark:border-white/10 dark:bg-ink-2 dark:text-sand"
          />
          <Button type="submit" loading={sending} aria-label={t('Send', 'Tuma')}><Send size={16} /></Button>
        </form>
      </div>
    </div>
  );
}

// ── Invoice ───────────────────────────────────────────────────────────────────

function InvoiceCard(
  { invoice, iAmSeller, onMarkPaid }: { invoice: Invoice; iAmSeller: boolean; onMarkPaid: () => void },
) {
  const { t } = useT();
  const paid = invoice.status === 'PAID';

  return (
    <Card className={cn('mt-2 border-l-4', paid ? 'border-l-leaf' : 'border-l-flame')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Receipt size={14} className="text-flame" />
            <span className="font-bold text-ink dark:text-sand">{invoice.number}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-ink/45">
            {new Date(invoice.issuedAt).toLocaleDateString()}
          </div>
        </div>
        <span className={cn(
          'rounded-full px-2 py-0.5 text-[10px] font-bold',
          paid ? 'bg-leaf/15 text-leaf-dark' : 'bg-amber-100 text-amber-700',
        )}>
          {paid ? t('PAID', 'IMELIPWA') : t('UNPAID', 'HAIJALIPWA')}
        </span>
      </div>

      <div className="mt-2 space-y-1 text-sm">
        {invoice.lines?.map((l, i) => (
          <div key={i} className="flex justify-between gap-2 text-ink/75 dark:text-sand/75">
            <span className="min-w-0 truncate">{l.description} × {l.qty}</span>
            <span className="shrink-0 tabular-nums">
              {formatMinor(l.lineTotalMinor, invoice.currency)}
            </span>
          </div>
        ))}
        {invoice.deliveryMinor > 0 && (
          <div className="flex justify-between text-ink/60">
            <span>{t('Delivery', 'Usafirishaji')}</span>
            <span className="tabular-nums">{formatMinor(invoice.deliveryMinor, invoice.currency)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-black/5 pt-1 font-extrabold text-ink dark:border-white/5 dark:text-sand">
          <span>{t('Total', 'Jumla')}</span>
          <span className="tabular-nums text-flame">{formatMoney(invoice.total, invoice.currency)}</span>
        </div>
      </div>

      {/* Where to pay — snapshotted when the invoice was raised. */}
      {invoice.payTo?.number && (
        <div className="mt-2 rounded-xl bg-black/5 p-2 text-xs dark:bg-white/5">
          <div className="font-semibold text-ink/70 dark:text-sand/70">{t('Pay to', 'Lipa kwa')}</div>
          <div className="text-ink/60 dark:text-sand/60">
            {[invoice.payTo.provider, invoice.payTo.number, invoice.payTo.name].filter(Boolean).join(' · ')}
          </div>
        </div>
      )}

      {invoice.notes && <p className="mt-2 whitespace-pre-line text-xs text-ink/55">{invoice.notes}</p>}

      {/* Only the payee confirms settlement. */}
      {iAmSeller && !paid && (
        <Button variant="leaf" className="mt-3 w-full" onClick={onMarkPaid}>
          <CheckCircle2 size={15} /> {t('Mark as paid', 'Weka kama imelipwa')}
        </Button>
      )}
      {!iAmSeller && !paid && (
        <p className="mt-2 text-[11px] text-ink/45">
          {t('The seller confirms once your payment arrives.', 'Muuzaji atathibitisha malipo yakifika.')}
        </p>
      )}
    </Card>
  );
}

function InvoiceBuilder(
  { conversationId, onCancel, onCreated }:
  { conversationId: string; onCancel: () => void; onCreated: () => void },
) {
  const { t } = useT();
  const [lines, setLines] = useState([{ description: '', qty: '1', unitPrice: '' }]);
  const [deliveryFee, setDeliveryFee] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const total = lines.reduce((n, l) => n + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0)
    + (Number(deliveryFee) || 0);

  function setLine(i: number, patch: Partial<(typeof lines)[number]>) {
    setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = lines
      .filter(l => l.description.trim() && Number(l.unitPrice) >= 0 && Number(l.qty) > 0)
      .map(l => ({ description: l.description.trim(), qty: Number(l.qty), unitPrice: Number(l.unitPrice) }));
    if (clean.length === 0) return toast.error(t('Add at least one line', 'Ongeza angalau kipengele kimoja'));

    setSaving(true);
    try {
      await invoicesApi.create({
        conversationId, lines: clean,
        deliveryFee: Number(deliveryFee) || 0,
        notes: notes.trim() || undefined,
      });
      toast.success(t('Invoice sent', 'Ankara imetumwa'));
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('Could not create the invoice', 'Imeshindwa kutengeneza ankara'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <div className="text-sm font-bold text-ink dark:text-sand">{t('New invoice', 'Ankara mpya')}</div>

        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_56px_88px_28px] items-end gap-1.5">
            <Field label={i === 0 ? t('Item', 'Kipengele') : undefined} placeholder={t('Description', 'Maelezo')}
              value={l.description} onChange={e => setLine(i, { description: e.target.value })} />
            <Field label={i === 0 ? t('Qty', 'Idadi') : undefined} type="number" inputMode="numeric"
              value={l.qty} onChange={e => setLine(i, { qty: e.target.value })} />
            <Field label={i === 0 ? t('Unit price', 'Bei') : undefined} type="number" inputMode="decimal"
              value={l.unitPrice} onChange={e => setLine(i, { unitPrice: e.target.value })} />
            <button type="button" aria-label={t('Remove line', 'Ondoa')}
              onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}
              className="mb-2.5 grid h-8 w-7 place-items-center text-ink/35 hover:text-danger">
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        <button type="button" onClick={() => setLines(ls => [...ls, { description: '', qty: '1', unitPrice: '' }])}
          className="inline-flex items-center gap-1 text-xs font-semibold text-flame">
          <Plus size={13} /> {t('Add line', 'Ongeza')}
        </button>

        <Field label={t('Delivery fee', 'Gharama ya usafirishaji')} type="number" inputMode="decimal"
          value={deliveryFee} onChange={e => setDeliveryFee(e.target.value)} />

        <Field label={t('Notes (optional)', 'Maelezo (hiari)')} placeholder={t('Payment terms, delivery date…', 'Masharti ya malipo, tarehe…')}
          value={notes} onChange={e => setNotes(e.target.value)} />

        <div className="flex items-center justify-between rounded-xl bg-black/5 px-3 py-2 dark:bg-white/5">
          <span className="text-sm font-semibold text-ink/70 dark:text-sand/70">{t('Total', 'Jumla')}</span>
          <span className="font-extrabold tabular-nums text-flame">{total.toLocaleString()}</span>
        </div>

        <div className="flex gap-2">
          <Button type="submit" loading={saving} className="flex-1">{t('Send invoice', 'Tuma ankara')}</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>{t('Cancel', 'Ghairi')}</Button>
        </div>
      </form>
    </Card>
  );
}
