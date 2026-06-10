'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Package } from 'lucide-react';
import { orders } from '../../lib/api';
import { Card, Spinner, EmptyState, Money, Badge } from '../../components/ui';

export default function OrdersPage() {
  const router = useRouter();
  const [list, setList] = useState<any[] | null>(null);

  useEffect(() => { orders.list().then((r) => setList(r.orders ?? [])).catch(() => setList([])); }, []);

  return (
    <div className="min-h-screen bg-sand dark:bg-background-dark pb-10">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/85 px-4 py-3 backdrop-blur dark:bg-background-dark/85">
        <button onClick={() => router.replace('/dashboard')} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10"><ArrowLeft size={18} /></button>
        <h1 className="font-extrabold">Oda zangu</h1>
      </header>

      <div className="mx-auto max-w-md space-y-2.5 px-5 pt-4">
        {list === null ? <Spinner /> :
          list.length === 0 ? <EmptyState icon={<Package size={36} />} title="Bado huna oda" sub="Agiza gesi yako ya kwanza kutoka ukurasa wa mwanzo." /> :
          list.map((o) => (
            <Link key={o.id} href={`/order/${o.id}`}>
              <Card className="flex items-center justify-between !p-3.5">
                <div>
                  <div className="font-semibold">{o.orderNo}</div>
                  <div className="text-xs text-ink/50">{o.supplier?.businessName} · {new Date(o.placedAt).toLocaleDateString()}</div>
                </div>
                <div className="text-right"><Money value={o.total} className="text-sm" /><div className="mt-1"><Badge status={o.status} /></div></div>
              </Card>
            </Link>
          ))
        }
      </div>
    </div>
  );
}
