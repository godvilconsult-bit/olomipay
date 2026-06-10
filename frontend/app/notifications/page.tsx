'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bell, Package, CreditCard, ShieldCheck } from 'lucide-react';
import { notifications, auth, Role } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { Card, Spinner, EmptyState } from '../../components/ui';
import { RoleNav } from '../../components/RoleNav';
import { timeAgo } from '../../lib/utils';

const ICON: Record<string, any> = { order: Package, payment: CreditCard, kyc: ShieldCheck };

export default function NotificationsPage() {
  const router = useRouter();
  const { t } = useT();
  const [items, setItems] = useState<any[] | null>(null);
  const [role, setRole]   = useState<Role>('HOUSEHOLD');

  useEffect(() => {
    auth.me().then((r) => setRole(r.user.role)).catch(() => {});
    notifications.list().then((r) => { setItems(r.notifications ?? []); notifications.readAll().catch(() => {}); }).catch(() => setItems([]));
  }, []);

  return (
    <div className="min-h-screen bg-sand pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/90 px-4 py-3 backdrop-blur">
        <button onClick={() => router.replace('/dashboard')} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5"><ArrowLeft size={18} /></button>
        <h1 className="font-extrabold">{t('Alerts', 'Arifa')}</h1>
      </header>

      <div className="mx-auto max-w-md space-y-2 px-5 pt-4">
        {items === null ? <Spinner /> :
          items.length === 0 ? <EmptyState icon={<Bell size={34} />} title={t('No alerts', 'Hakuna arifa')} sub={t('Order and payment alerts appear here.', 'Arifa za oda na malipo zitaonekana hapa.')} /> :
          items.map((n) => {
            const Icon = ICON[n.type] ?? Bell;
            const inner = (
              <Card className={`flex gap-3 !p-3 ${!n.isRead ? 'border-flame/30' : ''}`}>
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-flame/10 text-flame"><Icon size={17} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold">{n.title}</span><span className="flex-shrink-0 text-[11px] text-ink/40">{timeAgo(n.createdAt)}</span></div>
                  <p className="text-sm text-ink/60">{n.body}</p>
                </div>
              </Card>
            );
            return n.data?.orderId ? <Link key={n.id} href={`/order/${n.data.orderId}`}>{inner}</Link> : <div key={n.id}>{inner}</div>;
          })
        }
      </div>
      <RoleNav role={role} />
    </div>
  );
}
