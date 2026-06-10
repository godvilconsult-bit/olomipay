'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { ArrowLeft, Check, Bike, Phone, ShieldCheck, Star, Smartphone, Banknote } from 'lucide-react';
import { orders, getAccessToken } from '../../../lib/api';
import { useSocket } from '../../../lib/useSocket';
import { Card, Button, Spinner, Money, Badge, cn } from '../../../components/ui';
import type { MapMarker } from '../../../components/Map';

const Map = dynamic(() => import('../../../components/Map'), { ssr: false });

const STEPS = [
  { key: 'PLACED',    label: 'Imetumwa' },
  { key: 'ACCEPTED',  label: 'Imekubaliwa', match: ['ACCEPTED', 'BROADCAST'] },
  { key: 'CLAIMED',   label: 'Dereva amepatikana' },
  { key: 'PICKED',    label: 'Njiani' },
  { key: 'DELIVERED', label: 'Imefika', match: ['DELIVERED', 'COMPLETED'] },
];
function stepIndex(status: string): number {
  if (['PLACED', 'ALERTED'].includes(status)) return 0;
  if (['ACCEPTED', 'BROADCAST'].includes(status)) return 1;
  if (status === 'CLAIMED') return 2;
  if (status === 'PICKED') return 3;
  if (['DELIVERED', 'COMPLETED'].includes(status)) return 4;
  return -1;
}

export default function OrderPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { on } = useSocket(getAccessToken());
  const [order, setOrder] = useState<any>(null);
  const [paying, setPaying] = useState(false);
  const [stars, setStars]   = useState(0);
  const [riderPos, setRiderPos] = useState<{ lat: number; lng: number } | null>(null);

  const load = useCallback(async () => { try { const r = await orders.get(id); setOrder(r.order); } catch {} }, [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const events = ['order:accepted', 'order:claimed', 'order:picked', 'order:delivered', 'order:rejected', 'payment:paid'];
    const offs = events.map((e) => on(e, () => load()));
    const offLoc = on('delivery:location', (d: any) => setRiderPos({ lat: d.lat, lng: d.lng }));
    return () => { offs.forEach((o) => o?.()); offLoc?.(); };
  }, [on, load]);

  if (!order) return <div className="min-h-screen bg-sand dark:bg-background-dark"><Spinner /></div>;

  const idx = stepIndex(order.status);
  const cancelled = order.status === 'CANCELLED';
  const paid = order.payment?.status === 'PAID';
  const rider = order.delivery?.rider;

  async function pay(provider: string) {
    setPaying(true);
    try { await orders.pay(id, { provider }); toast.success(provider === 'CASH' ? 'Utalipa ukipokea' : 'Angalia simu yako kuthibitisha malipo'); setTimeout(load, 2000); }
    catch (e: any) { toast.error(e?.message ?? 'Imeshindikana'); } finally { setPaying(false); }
  }
  async function complete() { try { await orders.complete(id); toast.success('Asante!'); load(); } catch (e: any) { toast.error(e?.message); } }
  async function review(n: number) { setStars(n); try { await orders.review(id, { supplierRating: n, riderRating: n }); toast.success('Asante kwa tathmini!'); } catch {} }

  return (
    <div className="min-h-screen bg-sand dark:bg-background-dark pb-10">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/85 px-4 py-3 backdrop-blur dark:bg-background-dark/85">
        <button onClick={() => router.replace('/dashboard')} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10"><ArrowLeft size={18} /></button>
        <div><div className="font-extrabold">{order.orderNo}</div><div className="text-xs text-ink/50">{order.supplier?.businessName}</div></div>
        <div className="ml-auto"><Badge status={order.status} /></div>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        {/* progress */}
        {!cancelled ? (
          <Card>
            <div className="space-y-0">
              {STEPS.map((s, i) => {
                const done = i <= idx;
                return (
                  <div key={s.key} className="flex items-center gap-3">
                    <div className="flex flex-col items-center">
                      <span className={cn('grid h-7 w-7 place-items-center rounded-full text-white transition', done ? 'bg-grad-leaf' : 'bg-black/10 dark:bg-white/10')}>
                        {done ? <Check size={15} /> : <span className="text-xs">{i + 1}</span>}
                      </span>
                      {i < STEPS.length - 1 && <span className={cn('h-7 w-0.5', i < idx ? 'bg-leaf' : 'bg-black/10 dark:bg-white/10')} />}
                    </div>
                    <span className={cn('text-sm', done ? 'font-semibold' : 'text-ink/50')}>{s.label}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        ) : (
          <Card className="border-danger/30 !bg-danger/5 text-center"><p className="font-semibold text-danger">Oda hii ilighairiwa</p>{order.cancelReason && <p className="mt-1 text-sm text-ink/60">{order.cancelReason}</p>}</Card>
        )}

        {/* OTP */}
        {order.delivery?.otp && idx >= 1 && idx < 4 && (
          <Card className="bg-grad-brand text-white">
            <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck size={18} /> Namba ya uthibitisho — mpe dereva</div>
            <div className="mt-1 text-center text-4xl font-extrabold tracking-[.3em]">{order.delivery.otp}</div>
          </Card>
        )}

        {/* rider */}
        {rider && idx >= 2 && idx < 4 && (
          <Card className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-flame/15 text-flame"><Bike size={20} /></span>
            <div className="flex-1"><div className="font-semibold">{rider.name}</div><div className="text-xs text-ink/50">{rider.riderProfile?.vehicleType} {rider.riderProfile?.plateNo ? `· ${rider.riderProfile.plateNo}` : ''}</div></div>
            <a href={`tel:${rider.phone}`} className="grid h-10 w-10 place-items-center rounded-xl bg-leaf/15 text-leaf"><Phone size={18} /></a>
          </Card>
        )}

        {/* live map */}
        {idx >= 1 && idx < 4 && order.address && (() => {
          const markers: MapMarker[] = [{ lat: order.address.lat, lng: order.address.lng, kind: 'dest' }];
          if (order.supplier?.lat != null) markers.push({ lat: order.supplier.lat, lng: order.supplier.lng, kind: 'vendor' });
          const rp = riderPos ?? (order.delivery?.riderLat != null ? { lat: order.delivery.riderLat, lng: order.delivery.riderLng } : null);
          if (rp) markers.push({ lat: rp.lat, lng: rp.lng, kind: 'rider' });
          return <Card className="!p-1.5"><Map markers={markers} height={200} /></Card>;
        })()}

        {/* receipt */}
        <Card>
          {order.items?.map((it: any) => (
            <div key={it.id} className="flex justify-between text-sm"><span className="text-ink/70">{it.qty}× {it.brand} {it.productName}</span><Money value={it.lineTotal} className="text-xs" /></div>
          ))}
          <div className="mt-2 border-t border-black/5 pt-2 text-sm">
            <div className="flex justify-between text-ink/60"><span>Bidhaa</span><Money value={order.itemsTotal} className="text-xs" /></div>
            <div className="flex justify-between text-ink/60"><span>Usafiri</span><Money value={order.deliveryFee} className="text-xs" /></div>
            <div className="mt-1 flex justify-between font-bold"><span>Jumla</span><Money value={order.total} /></div>
          </div>
        </Card>

        {/* pay */}
        {!paid && !cancelled && (
          <Card>
            <div className="mb-2 text-sm font-semibold">Lipa oda</div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="primary" loading={paying} onClick={() => pay('MPESA')}><Smartphone size={16} /> Mobile Money</Button>
              <Button variant="ghost" loading={paying} onClick={() => pay('CASH')}><Banknote size={16} /> Cash</Button>
            </div>
          </Card>
        )}
        {paid && <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-leaf-dark"><Check size={16} /> Malipo yamekamilika</div>}

        {/* complete + review */}
        {order.status === 'DELIVERED' && <Button variant="leaf" onClick={complete} className="w-full">Thibitisha nimepokea gesi</Button>}
        {['DELIVERED', 'COMPLETED'].includes(order.status) && !order.review && (
          <Card className="text-center">
            <div className="mb-2 text-sm font-semibold">Mpe nyota dereva na muuzaji</div>
            <div className="flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => review(n)}><Star size={30} className={cn(n <= stars ? 'fill-ember text-ember' : 'text-black/20')} /></button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
