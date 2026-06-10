'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { ArrowLeft, Check, Bike, Phone, ShieldCheck, Star, Smartphone, Banknote } from 'lucide-react';
import { orders, getAccessToken } from '../../../lib/api';
import { useSocket } from '../../../lib/useSocket';
import { useT } from '../../../lib/i18n';
import { localPhone } from '../../../lib/utils';
import { Card, Button, Spinner, Money, Badge, cn } from '../../../components/ui';
import type { MapMarker } from '../../../components/Map';

const Map = dynamic(() => import('../../../components/Map'), { ssr: false });

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
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const { on } = useSocket(getAccessToken());
  const [order, setOrder] = useState<any>(null);
  const [paying, setPaying] = useState(false);
  const [stars, setStars]   = useState(0);
  const [riderPos, setRiderPos] = useState<{ lat: number; lng: number } | null>(null);

  const STEPS = [t('Placed', 'Imetumwa'), t('Accepted', 'Imekubaliwa'), t('Rider found', 'Dereva amepatikana'), t('On the way', 'Njiani'), t('Arrived', 'Imefika')];

  const load = useCallback(async () => { try { const r = await orders.get(id); setOrder(r.order); } catch {} }, [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const events = ['order:accepted', 'order:claimed', 'order:picked', 'order:delivered', 'order:rejected', 'payment:paid'];
    const offs = events.map((e) => on(e, () => load()));
    const offLoc = on('delivery:location', (d: any) => setRiderPos({ lat: d.lat, lng: d.lng }));
    return () => { offs.forEach((o) => o?.()); offLoc?.(); };
  }, [on, load]);

  if (!order) return <div className="min-h-screen bg-sand"><Spinner /></div>;

  const idx = stepIndex(order.status);
  const cancelled = order.status === 'CANCELLED';
  const paid = order.payment?.status === 'PAID';
  const rider = order.delivery?.rider;

  async function pay(provider: string) {
    setPaying(true);
    try { await orders.pay(id, { provider }); toast.success(provider === 'CASH' ? t("You'll pay on delivery", 'Utalipa ukipokea') : t('Check your phone to confirm payment', 'Angalia simu yako kuthibitisha')); setTimeout(load, 2000); }
    catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setPaying(false); }
  }
  async function complete() { try { await orders.complete(id); toast.success(t('Thank you!', 'Asante!')); load(); } catch (e: any) { toast.error(e?.message); } }
  async function review(n: number) { setStars(n); try { await orders.review(id, { supplierRating: n, riderRating: n }); toast.success(t('Thanks for the rating!', 'Asante kwa tathmini!')); } catch {} }

  return (
    <div className="min-h-screen bg-sand pb-10">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/90 px-4 py-3 backdrop-blur">
        <button onClick={() => router.replace('/dashboard')} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5"><ArrowLeft size={18} /></button>
        <div><div className="font-extrabold">{order.orderNo}</div><div className="text-xs text-ink/50">{order.supplier?.businessName}</div></div>
        <div className="ml-auto"><Badge status={order.status} /></div>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        {!cancelled ? (
          <Card>
            {STEPS.map((label, i) => {
              const done = i <= idx;
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex flex-col items-center">
                    <span className={cn('grid h-7 w-7 place-items-center rounded-full text-white transition', done ? 'bg-grad-leaf' : 'bg-black/10')}>{done ? <Check size={15} /> : <span className="text-xs">{i + 1}</span>}</span>
                    {i < STEPS.length - 1 && <span className={cn('h-7 w-0.5', i < idx ? 'bg-leaf' : 'bg-black/10')} />}
                  </div>
                  <span className={cn('text-sm', done ? 'font-semibold' : 'text-ink/50')}>{label}</span>
                </div>
              );
            })}
          </Card>
        ) : (
          <Card className="border-danger/30 !bg-danger/5 text-center"><p className="font-semibold text-danger">{t('This order was cancelled', 'Oda hii ilighairiwa')}</p>{order.cancelReason && <p className="mt-1 text-sm text-ink/60">{order.cancelReason}</p>}</Card>
        )}

        {order.delivery?.otp && idx >= 1 && idx < 4 && (
          <Card className="bg-grad-brand text-white">
            <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck size={18} /> {t('Confirmation code — give it to the rider', 'Namba ya uthibitisho — mpe dereva')}</div>
            <div className="mt-1 text-center text-4xl font-extrabold tracking-[.3em]">{order.delivery.otp}</div>
          </Card>
        )}

        {idx >= 1 && idx < 4 && order.address && (() => {
          const markers: MapMarker[] = [{ lat: order.address.lat, lng: order.address.lng, kind: 'dest' }];
          if (order.supplier?.lat != null) markers.push({ lat: order.supplier.lat, lng: order.supplier.lng, kind: 'vendor' });
          const rp = riderPos ?? (order.delivery?.riderLat != null ? { lat: order.delivery.riderLat, lng: order.delivery.riderLng } : null);
          if (rp) markers.push({ lat: rp.lat, lng: rp.lng, kind: 'rider' });
          return <Card className="!p-1.5"><Map markers={markers} height={200} /></Card>;
        })()}

        {rider && idx >= 2 && idx < 4 && (
          <Card className="flex items-center gap-3">
            <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-flame/15 text-flame"><Bike size={20} /></span>
            <div className="flex-1 min-w-0"><div className="font-semibold">{rider.name}</div><div className="text-xs text-ink/50">{rider.riderProfile?.vehicleType} {rider.riderProfile?.plateNo ? `· ${rider.riderProfile.plateNo}` : ''}</div></div>
            <a href={`tel:${rider.phone}`} className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-leaf/15 text-leaf"><Phone size={18} /></a>
          </Card>
        )}

        <Card>
          {order.items?.map((it: any) => (
            <div key={it.id} className="flex justify-between gap-2 text-sm"><span className="min-w-0 truncate text-ink/70">{it.qty}× {it.brand} {it.productName}</span><Money value={it.lineTotal} className="flex-shrink-0 text-xs" /></div>
          ))}
          <div className="mt-2 border-t border-black/5 pt-2 text-sm">
            <div className="flex justify-between text-ink/60"><span>{t('Items', 'Bidhaa')}</span><Money value={order.itemsTotal} className="text-xs" /></div>
            <div className="flex justify-between text-ink/60"><span>{t('Delivery', 'Usafiri')}</span><Money value={order.deliveryFee} className="text-xs" /></div>
            <div className="mt-1 flex justify-between font-bold"><span>{t('Total', 'Jumla')}</span><Money value={order.total} /></div>
          </div>
        </Card>

        {!paid && !cancelled && (
          <Card>
            <div className="mb-2 text-sm font-semibold">{t('Pay for order', 'Lipa oda')}</div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="primary" loading={paying} onClick={() => pay('MPESA')}><Smartphone size={16} /> {t('Mobile Money', 'Mobile Money')}</Button>
              <Button variant="ghost" loading={paying} onClick={() => pay('CASH')}><Banknote size={16} /> {t('Cash', 'Cash')}</Button>
            </div>
          </Card>
        )}
        {paid && <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-leaf-dark"><Check size={16} /> {t('Payment complete', 'Malipo yamekamilika')}</div>}

        {order.status === 'DELIVERED' && <Button variant="leaf" onClick={complete} className="w-full">{t('Confirm I received the gas', 'Thibitisha nimepokea gesi')}</Button>}
        {['DELIVERED', 'COMPLETED'].includes(order.status) && !order.review && (
          <Card className="text-center">
            <div className="mb-2 text-sm font-semibold">{t('Rate the rider and vendor', 'Mpe nyota dereva na muuzaji')}</div>
            <div className="flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => review(n)}><Star size={30} className={cn(n <= stars ? 'fill-ember text-ember' : 'text-black/20')} /></button>)}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
