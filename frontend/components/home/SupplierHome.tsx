'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Store, Bell, AlertTriangle, Check, X, MapPin } from 'lucide-react';
import { suppliers, getAccessToken, JikoUser } from '../../lib/api';
import { useSocket } from '../../lib/useSocket';
import { useT } from '../../lib/i18n';
import { localPhone } from '../../lib/utils';
import { AppHeader } from '../AppHeader';
import { RoleNav } from '../RoleNav';
import { Card, Button, Spinner, EmptyState, Money, Stat, Badge, cn } from '../ui';

const ACTIVE = ['ALERTED', 'PLACED', 'ACCEPTED', 'BROADCAST', 'CLAIMED', 'PICKED'];

export function SupplierHome({ user }: { user: JikoUser }) {
  const { t } = useT();
  const token = getAccessToken();
  const { on } = useSocket(token);
  const [me, setMe]   = useState<any>(null);
  const [list, setList] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [m, o] = await Promise.all([suppliers.me().catch(() => null), suppliers.orders().catch(() => ({ orders: [] }))]);
    setMe(m); setList(o.orders ?? []);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const offNew     = on('order:new', (order: any) => { setList((l) => l.find((x) => x.id === order.id) ? l : [order, ...l]); toast(`🔔 ${t('New order', 'Oda mpya')} — ${order.orderNo}`, { icon: '🔥' }); });
    const offClaimed = on('order:claimed', ({ orderId }: any) => setList((l) => l.map((x) => x.id === orderId ? { ...x, status: 'CLAIMED' } : x)));
    return () => { offNew?.(); offClaimed?.(); };
  }, [on, t]);

  async function toggleOpen() {
    const next = !me.profile.isOpen;
    setMe((m: any) => ({ ...m, profile: { ...m.profile, isOpen: next } }));
    try { await suppliers.update({ isOpen: next }); } catch { refresh(); }
  }
  async function accept(id: string) {
    setBusy(id);
    try { const r = await suppliers.accept(id); toast.success(`${t('Accepted. OTP', 'Imekubaliwa. OTP')}: ${r.otp}`); await refresh(); }
    catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setBusy(null); }
  }
  async function reject(id: string) {
    setBusy(id);
    try { await suppliers.reject(id); toast(t('Order rejected', 'Oda imekataliwa')); await refresh(); }
    catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setBusy(null); }
  }

  if (!me) return <Spinner />;
  const p = me.profile;
  const queue = list.filter((o) => ACTIVE.includes(o.status));

  return (
    <div className="min-h-screen pb-24">
      <AppHeader title={p.businessName} subtitle={t('Supplier dashboard', 'Dashibodi ya muuzaji')}
        right={<button onClick={toggleOpen} className={cn('rounded-full px-3 py-1.5 text-xs font-bold', p.isOpen ? 'bg-leaf/15 text-leaf-dark' : 'bg-black/10 text-ink/50')}>{p.isOpen ? t('OPEN', 'IMEFUNGULIWA') : t('CLOSED', 'IMEFUNGWA')}</button>} />

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label={t('Pending', 'Zinasubiri')} value={me.stats.pending} accent />
          <Stat label={t('Today', 'Leo')} value={me.stats.today} />
          <Stat label={t('Low stock', 'Stock ndogo')} value={me.stats.lowStock} />
        </div>

        {me.stats.lowStock > 0 && (
          <Card className="flex items-center gap-3 border-warning/30 !bg-warning/5">
            <AlertTriangle className="text-warning flex-shrink-0" size={20} />
            <div className="flex-1 text-sm"><span className="font-semibold">{me.stats.lowStock} {t('items', 'bidhaa')}</span> {t('are low on stock. Request a restock.', 'zina stock ndogo. Omba kujaza upya.')}</div>
          </Card>
        )}

        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink/70"><Bell size={15} /> {t('Orders needing action', 'Oda zinazohitaji hatua')}</h2>
          {queue.length === 0 ? <EmptyState icon={<Store size={36} />} title={t('No orders right now', 'Hakuna oda kwa sasa')} sub={t('New orders appear here the instant they come in.', 'Oda mpya zitaonekana hapa papo hapo.')} /> :
            <div className="space-y-3">
              {queue.map((o) => (
                <Card key={o.id} className={cn(['ALERTED', 'PLACED'].includes(o.status) && 'border-flame/40')}>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="font-bold">{o.orderNo}</div>
                      <div className="truncate text-xs text-ink/50">{o.household?.name} · {localPhone(o.household?.phone)}</div>
                    </div>
                    <Badge status={o.status} />
                  </div>
                  <div className="mt-2 space-y-1 text-sm">
                    {o.items?.map((it: any) => (
                      <div key={it.id} className="flex justify-between gap-2"><span className="min-w-0 truncate text-ink/70">{it.qty}× {it.brand} {it.productName}</span><Money value={it.lineTotal} className="flex-shrink-0 text-xs" /></div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-xs text-ink/50"><MapPin size={12} className="flex-shrink-0" /> {o.address?.label}{o.address?.ward ? ` · ${o.address.ward}` : ''}</div>
                  <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-3">
                    <div className="text-xs text-ink/50">{t('Total', 'Jumla')} <Money value={o.total} className="ml-1 text-ink" /></div>
                    {['ALERTED', 'PLACED'].includes(o.status) ? (
                      <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => reject(o.id)} loading={busy === o.id} className="!px-3"><X size={16} /></Button>
                        <Button variant="primary" onClick={() => accept(o.id)} loading={busy === o.id}><Check size={16} /> {t('Accept', 'Kubali')}</Button>
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-ink/50">{o.status === 'CLAIMED' ? t('Rider found', 'Dereva amepatikana') : o.status === 'PICKED' ? t('On the way', 'Njiani') : t('Waiting for rider', 'Inasubiri dereva')}</span>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          }
        </div>
      </div>
      <RoleNav role="SUPPLIER" />
    </div>
  );
}
