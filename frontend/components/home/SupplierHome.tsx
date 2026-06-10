'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Store, Bell, Package, TrendingUp, AlertTriangle, Check, X, MapPin } from 'lucide-react';
import { suppliers, getAccessToken, JikoUser } from '../../lib/api';
import { useSocket } from '../../lib/useSocket';
import { AppHeader } from '../AppHeader';
import { RoleNav } from '../RoleNav';
import { Card, Button, Spinner, EmptyState, Money, Stat, Badge, cn } from '../ui';

const ACTIVE = ['ALERTED', 'PLACED', 'ACCEPTED', 'BROADCAST', 'CLAIMED', 'PICKED'];

export function SupplierHome({ user }: { user: JikoUser }) {
  const token = getAccessToken();
  const { on } = useSocket(token);
  const [me, setMe]         = useState<any>(null);
  const [list, setList]     = useState<any[]>([]);
  const [busy, setBusy]     = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [m, o] = await Promise.all([suppliers.me().catch(() => null), suppliers.orders().catch(() => ({ orders: [] }))]);
    setMe(m); setList(o.orders ?? []);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Live alerts.
  useEffect(() => {
    const offNew     = on('order:new', (order: any) => { setList((l) => l.find((x) => x.id === order.id) ? l : [order, ...l]); toast(`🔔 Oda mpya — ${order.orderNo}`, { icon: '🔥' }); });
    const offClaimed = on('order:claimed', ({ orderId }: any) => setList((l) => l.map((x) => x.id === orderId ? { ...x, status: 'CLAIMED' } : x)));
    return () => { offNew?.(); offClaimed?.(); };
  }, [on]);

  async function toggleOpen() {
    const next = !me.profile.isOpen;
    setMe((m: any) => ({ ...m, profile: { ...m.profile, isOpen: next } }));
    try { await suppliers.update({ isOpen: next }); } catch { refresh(); }
  }
  async function accept(id: string) {
    setBusy(id);
    try { const r = await suppliers.accept(id); toast.success(`Imekubaliwa. OTP: ${r.otp}`); await refresh(); }
    catch (e: any) { toast.error(e?.message ?? 'Imeshindikana'); } finally { setBusy(null); }
  }
  async function reject(id: string) {
    setBusy(id);
    try { await suppliers.reject(id); toast('Oda imekataliwa'); await refresh(); }
    catch (e: any) { toast.error(e?.message ?? 'Imeshindikana'); } finally { setBusy(null); }
  }

  if (!me) return <Spinner />;
  const p = me.profile;
  const queue = list.filter((o) => ACTIVE.includes(o.status));

  return (
    <div className="min-h-screen pb-24">
      <AppHeader
        title={p.businessName}
        subtitle="Dashibodi ya muuzaji"
        right={
          <button onClick={toggleOpen} className={cn('rounded-full px-3 py-1.5 text-xs font-bold', p.isOpen ? 'bg-leaf/15 text-leaf-dark' : 'bg-black/10 text-ink/50')}>
            {p.isOpen ? 'IMEFUNGULIWA' : 'IMEFUNGWA'}
          </button>
        }
      />

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Zinasubiri" value={me.stats.pending} accent />
          <Stat label="Leo" value={me.stats.today} />
          <Stat label="Stock ndogo" value={me.stats.lowStock} />
        </div>

        {me.stats.lowStock > 0 && (
          <Card className="flex items-center gap-3 border-warning/30 !bg-warning/5">
            <AlertTriangle className="text-warning" size={20} />
            <div className="flex-1 text-sm"><span className="font-semibold">{me.stats.lowStock} bidhaa</span> zina stock ndogo. Omba kujaza upya.</div>
          </Card>
        )}

        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink/70"><Bell size={15} /> Oda zinazohitaji hatua</h2>
          {queue.length === 0 ? <EmptyState icon={<Store size={36} />} title="Hakuna oda kwa sasa" sub="Oda mpya zitaonekana hapa papo hapo zinapoingia." /> :
            <div className="space-y-3">
              {queue.map((o) => (
                <Card key={o.id} className={cn(['ALERTED', 'PLACED'].includes(o.status) && 'border-flame/40')}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold">{o.orderNo}</div>
                      <div className="text-xs text-ink/50">{o.household?.name} · {o.household?.phone}</div>
                    </div>
                    <Badge status={o.status} />
                  </div>

                  <div className="mt-2 space-y-1 text-sm">
                    {o.items?.map((it: any) => (
                      <div key={it.id} className="flex justify-between"><span className="text-ink/70">{it.qty}× {it.brand} {it.productName}</span><Money value={it.lineTotal} className="text-xs" /></div>
                    ))}
                  </div>

                  <div className="mt-2 flex items-center gap-1 text-xs text-ink/50"><MapPin size={12} /> {o.address?.label}{o.address?.ward ? ` · ${o.address.ward}` : ''}</div>

                  <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-3">
                    <div className="text-xs text-ink/50">Jumla <Money value={o.total} className="ml-1 text-ink" /></div>
                    {['ALERTED', 'PLACED'].includes(o.status) ? (
                      <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => reject(o.id)} loading={busy === o.id} className="!px-3"><X size={16} /></Button>
                        <Button variant="primary" onClick={() => accept(o.id)} loading={busy === o.id}><Check size={16} /> Kubali</Button>
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-ink/50">{o.status === 'CLAIMED' ? 'Dereva amepatikana' : o.status === 'PICKED' ? 'Njiani' : 'Inasubiri dereva'}</span>
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
