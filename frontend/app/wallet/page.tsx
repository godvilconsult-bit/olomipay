'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Wallet as WalletIcon, ArrowDownToLine, AlertTriangle, Clock } from 'lucide-react';
import { wallet, auth, type WalletTxn } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { localPhone } from '../../lib/utils';
import { Card, Button, Spinner, Money, EmptyState, cn } from '../../components/ui';

export default function WalletPage() {
  const router = useRouter();
  const { t } = useT();
  const [data, setData] = useState<{ balance: number; txns: WalletTxn[]; pendingCashouts: any[] } | null>(null);
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCashout, setShowCashout] = useState(false);

  const load = () => wallet.get().then((d) => setData(d)).catch(() => setData({ balance: 0, txns: [], pendingCashouts: [] }));
  useEffect(() => { load(); auth.me().then((r) => setPhone(localPhone(r.user.phone))).catch(() => {}); }, []);

  function txnLabel(type: string) {
    return ({
      EARNING: t('Earning', 'Mapato'), CASH_FLOAT: t('Cash held for JIKO', 'Cash ya JIKO'),
      PAYOUT: t('Cash-out', 'Kutoa pesa'), SETTLEMENT: t('Float settled', 'Umelipa deni'),
      REFERRAL: t('Referral bonus', 'Bonasi ya rufaa'), LOYALTY: t('Loyalty', 'Uaminifu'),
      REFUND: t('Refund', 'Marejesho'), ADJUSTMENT: t('Adjustment', 'Marekebisho'),
    } as Record<string, string>)[type] ?? type;
  }

  async function cashout() {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error(t('Enter an amount', 'Weka kiasi'));
    setBusy(true);
    try { await wallet.cashout({ amount: amt, phone }); toast.success(t('Cash-out requested', 'Ombi la kutoa pesa limetumwa')); setShowCashout(false); setAmount(''); load(); }
    catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setBusy(false); }
  }
  async function settle() {
    setBusy(true);
    try { await wallet.settle(); toast.success(t('Settled — thank you', 'Umelipa — asante')); load(); }
    catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setBusy(false); }
  }

  if (!data) return <div className="min-h-screen bg-sand"><Spinner /></div>;
  const neg = data.balance < 0;

  return (
    <div className="min-h-screen bg-sand pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/90 px-4 py-3 backdrop-blur">
        <button onClick={() => router.replace('/dashboard')} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5"><ArrowLeft size={18} /></button>
        <h1 className="font-extrabold">{t('Wallet', 'Pochi')}</h1>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        {/* balance */}
        <div className={cn('rounded-ds-xl p-5 text-white shadow-ds-card', neg ? 'bg-gradient-to-br from-flame to-ember' : 'bg-grad-leaf')}>
          <div className="flex items-center gap-2 text-sm font-medium text-white/80"><WalletIcon size={16} /> {neg ? t('You owe JIKO', 'Unadaiwa na JIKO') : t('Available balance', 'Salio lililopo')}</div>
          <div className="mt-1 text-3xl font-extrabold"><Money value={Math.abs(data.balance)} className="text-3xl" /></div>
          {neg
            ? <Button variant="ghost" loading={busy} onClick={settle} className="mt-3 w-full !bg-white !text-flame"><ArrowDownToLine size={16} /> {t('Settle now', 'Lipa sasa')}</Button>
            : <Button variant="ghost" disabled={data.balance <= 0} onClick={() => setShowCashout((s) => !s)} className="mt-3 w-full !bg-white !text-leaf-dark"><ArrowDownToLine size={16} /> {t('Cash out', 'Toa pesa')}</Button>}
        </div>

        {neg && (
          <Card className="flex items-center gap-2 border-warning/40 !bg-warning/5 text-sm">
            <AlertTriangle size={18} className="flex-shrink-0 text-warning" />
            <span>{t('This is cash you collected on delivery that belongs to JIKO and vendors. Settle it to keep delivering.', 'Hii ni pesa uliyokusanya ya JIKO na wauzaji. Ilipe ili uendelee kufanya kazi.')}</span>
          </Card>
        )}

        {showCashout && !neg && (
          <Card className="space-y-3">
            <div className="text-sm font-semibold">{t('Cash out to mobile money', 'Toa pesa kwenda pesa za simu')}</div>
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder={t('Amount (TZS)', 'Kiasi (TZS)')} className="w-full min-h-touch rounded-2xl border border-black/15 bg-white px-4 text-ink outline-none focus:border-flame" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XX XXX XXX" className="w-full min-h-touch rounded-2xl border border-black/15 bg-white px-4 text-ink outline-none focus:border-flame" />
            <Button variant="primary" loading={busy} onClick={cashout} className="w-full">{t('Request cash-out', 'Omba kutoa pesa')}</Button>
          </Card>
        )}

        {data.pendingCashouts?.length > 0 && (
          <Card className="!p-3">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink/40">{t('Pending cash-outs', 'Yanayosubiri')}</div>
            {data.pendingCashouts.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-1 text-sm"><span className="inline-flex items-center gap-1.5 text-ink/60"><Clock size={13} /> {new Date(c.createdAt).toLocaleDateString()}</span><Money value={c.amount} className="text-xs" /></div>
            ))}
          </Card>
        )}

        {/* ledger */}
        <div>
          <h2 className="mb-2 text-sm font-bold text-ink/70">{t('History', 'Historia')}</h2>
          {data.txns.length === 0 ? <EmptyState icon={<WalletIcon size={34} />} title={t('No transactions yet', 'Bado hakuna miamala')} /> :
            <div className="divide-y divide-black/5 overflow-hidden rounded-ds-xl bg-white">
              {data.txns.map((x) => (
                <div key={x.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{txnLabel(x.type)}</div>
                    <div className="truncate text-xs text-ink/40">{x.note ?? ''} · {new Date(x.createdAt).toLocaleDateString()}</div>
                  </div>
                  <span className={cn('flex-shrink-0 text-sm font-bold tabular-nums', x.amount >= 0 ? 'text-leaf-dark' : 'text-flame')}>{x.amount >= 0 ? '+' : '−'}{Math.abs(x.amount).toLocaleString()}</span>
                </div>
              ))}
            </div>}
        </div>
      </div>
    </div>
  );
}
