'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Package, RotateCcw } from 'lucide-react';
import { orders } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { Spinner, EmptyState, Money, Badge, Button, ListGroup } from '../../components/ui';
import { RoleNav } from '../../components/RoleNav';

export default function OrdersPage() {
  const router = useRouter();
  const { t } = useT();
  const [list, setList] = useState<any[] | null>(null);
  const [reordering, setReordering] = useState<string | null>(null);

  useEffect(() => { orders.list().then((r) => setList(r.orders ?? [])).catch(() => setList([])); }, []);

  async function reorder(id: string) {
    setReordering(id);
    try {
      const r = await orders.reorder(id);
      toast.success(t('Reordered! Complete payment', 'Imeagizwa tena!'));
      if (r.order?.id) router.push(`/order/${r.order.id}`);
    } catch (e: any) {
      toast.error(e?.message ?? t('Could not reorder', 'Imeshindwa'));
    } finally { setReordering(null); }
  }

  return (
    <div className="min-h-screen bg-sand pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/90 px-4 py-3 backdrop-blur">
        <button onClick={() => router.replace('/dashboard')} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5"><ArrowLeft size={18} /></button>
        <h1 className="font-extrabold">{t('My orders', 'Oda zangu')}</h1>
      </header>

      <div className="mx-auto max-w-md space-y-2.5 px-5 pt-4">
        {list === null ? <Spinner /> :
          list.length === 0 ? <EmptyState icon={<Package size={36} />} title={t('No orders yet', 'Bado huna oda')} sub={t('Order your first gas from the home screen.', 'Agiza gesi yako ya kwanza kutoka ukurasa wa mwanzo.')} /> :
          <ListGroup>
            {list.map((o) => {
              const finished = ['COMPLETED', 'CANCELLED'].includes(o.status);
              return (
                <div key={o.id} className="flex items-center justify-between gap-3 px-3 py-3">
                  <Link href={`/order/${o.id}`} className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{o.supplier?.businessName}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink/50"><Money value={o.total} className="text-xs" /> · <Badge status={o.status} /></div>
                  </Link>
                  {finished
                    ? <Button variant="primary" loading={reordering === o.id} onClick={() => reorder(o.id)} className="flex-shrink-0 !px-3"><RotateCcw size={15} /> {t('Reorder', 'Agiza tena')}</Button>
                    : <Link href={`/order/${o.id}`} className="flex-shrink-0 text-xs font-semibold text-flame">{t('View', 'Angalia')}</Link>}
                </div>
              );
            })}
          </ListGroup>
        }
      </div>
      <RoleNav role="HOUSEHOLD" />
    </div>
  );
}
