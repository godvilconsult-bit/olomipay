'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Wallet, Bike, Star } from 'lucide-react';
import { jobs } from '../../../lib/api';
import { useT } from '../../../lib/i18n';
import { Card, Spinner, EmptyState, Money, Stat } from '../../../components/ui';
import { RoleNav } from '../../../components/RoleNav';

export default function RiderEarnings() {
  const router = useRouter();
  const { t } = useT();
  const [data, setData] = useState<any>(null);

  useEffect(() => { jobs.earnings().then(setData).catch(() => setData({ history: [], totalEarnings: 0, totalDeliveries: 0, rating: 0 })); }, []);
  if (!data) return <div className="min-h-screen bg-sand dark:bg-background-dark"><Spinner /></div>;

  return (
    <div className="min-h-screen bg-sand dark:bg-background-dark pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/85 px-4 py-3 backdrop-blur dark:bg-background-dark/85">
        <button onClick={() => router.replace('/dashboard')} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10"><ArrowLeft size={18} /></button>
        <h1 className="font-extrabold">{t('My earnings', 'Mapato yangu')}</h1>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        {/* Lifetime totals */}
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label={t('Total', 'Jumla')} value={<Money value={data.totalEarnings} className="text-base" />} accent />
          <Stat label={t('Trips', 'Safari')} value={data.totalDeliveries} />
          <Stat label={t('Rating', 'Nyota')} value={<span className="inline-flex items-center gap-1"><Star size={15} className="fill-ember text-ember" />{data.rating ? data.rating.toFixed(1) : '—'}</span>} />
        </div>

        {/* Today / this week */}
        {data.today && (
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-ds-xl border border-black/5 bg-white p-3 dark:bg-ink-2"><div className="text-xs text-ink/50">{t('Today', 'Leo')}</div><Money value={data.today.earnings} className="text-base" /><div className="text-[10px] text-ink/40">{data.today.trips} {t('trips', 'safari')}</div></div>
            <div className="rounded-ds-xl border border-black/5 bg-white p-3 dark:bg-ink-2"><div className="text-xs text-ink/50">{t('This week', 'Wiki hii')}</div><Money value={data.week?.earnings ?? 0} className="text-base" /><div className="text-[10px] text-ink/40">{data.week?.trips ?? 0} {t('trips', 'safari')}</div></div>
          </div>
        )}

        {/* Weekly goal / incentive bonus */}
        {data.incentive && (
          <Card className="!p-3">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-semibold text-ink/70">🎯 {t('Weekly goal', 'Lengo la wiki')}</span>
              <span className="text-ink/50">{Math.min(data.incentive.trips, data.incentive.target)}/{data.incentive.target} · <Money value={data.incentive.bonus} className="text-xs" /> {t('bonus', 'bonasi')}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/5">
              <div className="h-full rounded-full bg-grad-leaf transition-all" style={{ width: `${Math.min(100, (data.incentive.trips / data.incentive.target) * 100)}%` }} />
            </div>
            {data.incentive.trips >= data.incentive.target && <div className="mt-1 text-[10px] font-semibold text-leaf-dark">{t('Bonus earned this week! 🎉', 'Umepata bonasi wiki hii! 🎉')}</div>}
          </Card>
        )}

        {/* Payment history */}
        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink/70"><Wallet size={15} /> {t('Payment history', 'Historia ya malipo')}</h2>
          {(!data.history || data.history.length === 0) ? <EmptyState icon={<Bike size={34} />} title={t("No completed trips yet", 'Bado hujakamilisha safari')} /> :
            <div className="space-y-2">
              {data.history.map((d: any) => (
                <Card key={d.id} className="flex items-center justify-between !p-3">
                  <div><div className="text-sm font-semibold">{d.order?.orderNo}</div><div className="text-xs text-ink/50">{d.order?.deliveredAt ? new Date(d.order.deliveredAt).toLocaleString() : ''}</div></div>
                  <Money value={d.order?.deliveryFee ?? 0} className="text-leaf-dark" />
                </Card>
              ))}
            </div>
          }
        </div>
      </div>

      <RoleNav role="RIDER" />
    </div>
  );
}
