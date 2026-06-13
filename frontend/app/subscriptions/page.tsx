'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, RefreshCw, Pause, Play, Trash2 } from 'lucide-react';
import { subscriptions } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { Card, Spinner, EmptyState, cn } from '../../components/ui';

export default function SubscriptionsPage() {
  const router = useRouter();
  const { t } = useT();
  const [list, setList] = useState<any[] | null>(null);

  const load = () => subscriptions.list().then((r) => setList(r.subscriptions ?? [])).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  async function toggle(s: any) {
    setList((l) => l!.map((x) => x.id === s.id ? { ...x, isActive: !x.isActive } : x));
    try { await subscriptions.pause(s.id, !s.isActive); } catch { toast.error(t('Failed', 'Imeshindikana')); load(); }
  }
  async function cancel(id: string) {
    if (!confirm(t('Cancel this auto-refill?', 'Sitisha urejeshaji huu?'))) return;
    try { await subscriptions.cancel(id); toast.success(t('Cancelled', 'Imesitishwa')); load(); } catch { toast.error(t('Failed', 'Imeshindikana')); }
  }

  return (
    <div className="min-h-screen bg-sand pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/90 px-4 py-3 backdrop-blur">
        <button onClick={() => router.replace('/dashboard')} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5"><ArrowLeft size={18} /></button>
        <h1 className="font-extrabold">{t('Auto-refill', 'Urejeshaji otomatiki')}</h1>
      </header>

      <div className="mx-auto max-w-md space-y-3 px-5 pt-4">
        {list === null ? <Spinner /> :
          list.length === 0 ? <EmptyState icon={<RefreshCw size={36} />} title={t('No auto-refills yet', 'Bado hakuna')} sub={t('From any past order, tap "Auto-refill" to get gas delivered on a schedule.', 'Kutoka oda yoyote, bonyeza "Auto-refill" upate gesi kwa ratiba.')} /> :
          list.map((s) => (
            <Card key={s.id} className="flex items-center gap-3">
              <span className={cn('grid h-10 w-10 flex-shrink-0 place-items-center rounded-full', s.isActive ? 'bg-leaf/15 text-leaf-dark' : 'bg-black/5 text-ink/40')}><RefreshCw size={18} /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{s.vendorName ?? t('Vendor', 'Muuzaji')}</div>
                <div className="text-xs text-ink/50">
                  {t('Every', 'Kila')} {s.intervalDays} {t('days', 'siku')}
                  {s.isActive ? ` · ${t('next', 'ijayo')} ${new Date(s.nextRunAt).toLocaleDateString()}` : ` · ${t('paused', 'imesimama')}`}
                </div>
              </div>
              <button onClick={() => toggle(s)} className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-black/5">{s.isActive ? <Pause size={16} /> : <Play size={16} />}</button>
              <button onClick={() => cancel(s.id)} className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg text-danger"><Trash2 size={16} /></button>
            </Card>
          ))
        }
      </div>
    </div>
  );
}
