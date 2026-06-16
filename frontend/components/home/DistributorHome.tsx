'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Truck, Boxes, Store, Phone, Check, X, Package, ChevronRight, Power } from 'lucide-react';
import { distributors, getAccessToken, JikoUser } from '../../lib/api';
import { useSocket } from '../../lib/useSocket';
import { useT } from '../../lib/i18n';
import { localPhone, timeAgo } from '../../lib/utils';
import { AppHeader } from '../AppHeader';
import { RoleNav } from '../RoleNav';
import { Card, Button, Spinner, EmptyState, Money, cn } from '../ui';

const FLOW: Record<string, { label: [string, string]; cls: string }> = {
  PLACED:     { label: ['New', 'Mpya'],            cls: 'bg-flame/15 text-flame' },
  ACCEPTED:   { label: ['Accepted', 'Imekubaliwa'], cls: 'bg-blue/15 text-blue-700' },
  DISPATCHED: { label: ['Dispatched', 'Imetumwa'], cls: 'bg-ember/15 text-ember' },
  RECEIVED:   { label: ['Received', 'Imepokelewa'], cls: 'bg-leaf/15 text-leaf-dark' },
  CANCELLED:  { label: ['Cancelled', 'Imeghairiwa'], cls: 'bg-black/10 text-ink/40' },
};

export function DistributorHome({ user }: { user: JikoUser }) {
  const { t } = useT();
  const { on } = useSocket(getAccessToken());
  const [profile, setProfile] = useState<any>(user.distributorProfile ?? null);
  const [orders, setOrders] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [me, o] = await Promise.all([distributors.me().catch(() => null), distributors.orders().catch(() => ({ orders: [] }))]);
    if (me?.profile) setProfile(me.profile);
    setOrders(o.orders ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const off = on('notification', () => load()); return () => off?.(); }, [on, load]);

  async function act(id: string, fn: () => Promise<any>, ok: string) {
    setBusy(id);
    try { await fn(); toast.success(ok); await load(); }
    catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setBusy(null); }
  }
  async function toggleActive() {
    const isActive = !profile?.isActive;
    try { const r = await distributors.updateMe({ isActive }); setProfile(r.profile); }
    catch { toast.error(t('Failed', 'Imeshindikana')); }
  }

  if (orders === null) return <Spinner />;
  const live = orders.filter((o) => ['PLACED', 'ACCEPTED', 'DISPATCHED'].includes(o.status));
  const past = orders.filter((o) => ['RECEIVED', 'CANCELLED'].includes(o.status));

  return (
    <div className="min-h-screen pb-24">
      <AppHeader title={t('Distributor', 'Msambazaji')} subtitle={profile?.businessName ?? user.name ?? undefined}
        right={<button onClick={toggleActive} className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold', profile?.isActive ? 'bg-leaf/15 text-leaf-dark' : 'bg-black/10 text-ink/50')}><Power size={13} /> {profile?.isActive ? t('Open', 'Wazi') : t('Closed', 'Imefungwa')}</button>} />

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        <Link href="/distributor/stock"><Card className="flex items-center justify-between !p-3.5">
          <span className="flex items-center gap-2 font-semibold"><Boxes size={18} className="text-flame" /> {t('Wholesale stock & prices', 'Bidhaa na bei za jumla')}</span>
          <ChevronRight size={18} className="text-ink/30" />
        </Card></Link>

        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink/70"><Truck size={15} /> {t('Restock orders from shops', 'Oda za maduka')} ({live.length})</h2>
          {live.length === 0 ? <EmptyState icon={<Package size={34} />} title={t('No open orders', 'Hakuna oda')} sub={t('Shops in your region will order stock here.', 'Maduka yataagiza hapa.')} /> :
            <div className="space-y-2.5">
              {live.map((o) => {
                const f = FLOW[o.status] ?? FLOW.PLACED;
                return (
                  <Card key={o.id}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-bold"><Store size={15} className="flex-shrink-0 text-flame" /><span className="truncate">{o.supplier?.businessName}</span></div>
                        <div className="text-xs text-ink/50">{[o.supplier?.district, o.supplier?.region].filter(Boolean).join(' · ')} · {timeAgo(o.createdAt)}</div>
                      </div>
                      <span className={cn('flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold', f.cls)}>{t(f.label[0], f.label[1])}</span>
                    </div>
                    <div className="mt-2 space-y-1 border-t border-black/5 pt-2 text-sm">
                      {o.items.map((it: any) => (
                        <div key={it.id} className="flex items-center justify-between"><span className="text-ink/70">{it.qty}× {it.brand} {it.name}</span><Money value={it.qty * it.unitPrice} className="text-xs" /></div>
                      ))}
                      <div className="flex items-center justify-between border-t border-black/5 pt-1.5 font-bold"><span>{t('Total', 'Jumla')} · {o.payMethod}</span><Money value={o.total} className="text-flame" /></div>
                    </div>
                    {o.note && <div className="mt-1.5 rounded-lg bg-black/[.03] px-2 py-1 text-xs text-ink/60">“{o.note}”</div>}
                    <div className="mt-3 flex items-center gap-2">
                      <a href={`tel:${o.supplier?.phone}`} className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-black/5 text-ink/60"><Phone size={16} /></a>
                      {o.status === 'PLACED' && <>
                        <Button variant="ghost" loading={busy === o.id} onClick={() => act(o.id, () => distributors.cancel(o.id), t('Declined', 'Imekataliwa'))} className="flex-1 !text-sm"><X size={15} /> {t('Decline', 'Kataa')}</Button>
                        <Button variant="primary" loading={busy === o.id} onClick={() => act(o.id, () => distributors.accept(o.id), t('Accepted', 'Imekubaliwa'))} className="flex-1 !text-sm"><Check size={15} /> {t('Accept', 'Kubali')}</Button>
                      </>}
                      {o.status === 'ACCEPTED' && <Button variant="primary" loading={busy === o.id} onClick={() => act(o.id, () => distributors.dispatch(o.id), t('Dispatched 🚚', 'Imetumwa 🚚'))} className="flex-1"><Truck size={16} /> {t('Mark dispatched', 'Thibitisha umetuma')}</Button>}
                      {o.status === 'DISPATCHED' && <div className="flex-1 rounded-xl bg-ember/10 py-2.5 text-center text-sm font-semibold text-ember">{t('Waiting for shop to confirm receipt', 'Inasubiri duka lithibitishe')}</div>}
                    </div>
                  </Card>
                );
              })}
            </div>}
        </div>

        {past.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-bold text-ink/70">{t('History', 'Historia')}</h2>
            <div className="space-y-2">
              {past.map((o) => {
                const f = FLOW[o.status] ?? FLOW.RECEIVED;
                return (
                  <Card key={o.id} className="flex items-center justify-between !p-3">
                    <div className="min-w-0"><div className="truncate text-sm font-semibold">{o.supplier?.businessName}</div><div className="text-xs text-ink/50">{o.orderNo} · {timeAgo(o.createdAt)}</div></div>
                    <div className="flex items-center gap-2"><Money value={o.total} className="text-sm" /><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', f.cls)}>{t(f.label[0], f.label[1])}</span></div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <RoleNav role="DISTRIBUTOR" />
    </div>
  );
}
