'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { ArrowLeft, Check, Bike, Phone, ShieldCheck, Star, Smartphone, Banknote, HandCoins } from 'lucide-react';
import { orders, getAccessToken } from '../../../lib/api';
import { useSocket } from '../../../lib/useSocket';
import { useT } from '../../../lib/i18n';
import { localPhone } from '../../../lib/utils';
import { Card, Button, Spinner, Money, Badge, cn } from '../../../components/ui';
import type { MapMarker } from '../../../components/Map';

const Map = dynamic(() => import('../../../components/Map'), { ssr: false });

function stepIndex(status: string): number {
  if (['PLACED', 'ALERTED'].includes(status)) return 0;
  if (status === 'ACCEPTED') return 1;
  if (['RIDER_OFFERED', 'RIDER_ACCEPTED'].includes(status)) return 2;
  if (status === 'FEE_CONFIRMED') return 3;
  if (status === 'PICKED') return 4;
  if (['DELIVERED', 'COMPLETED'].includes(status)) return 5;
  return -1;
}

function Avatar({ name, url, size = 44 }: { name?: string; url?: string; size?: number }) {
  if (url) return <img src={url} alt={name ?? ''} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  return <span className="grid flex-shrink-0 place-items-center rounded-full bg-flame/15 font-bold text-flame" style={{ width: size, height: size }}>{(name ?? '?').slice(0, 2).toUpperCase()}</span>;
}

export default function OrderPage() {
  const router = useRouter();
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const { on } = useSocket(getAccessToken());
  const [order, setOrder] = useState<any>(null);
  const [stars, setStars] = useState(0);
  const [busy, setBusy]   = useState(false);
  const [riderPos, setRiderPos] = useState<{ lat: number; lng: number } | null>(null);

  const STEPS = [t('Placed', 'Imetumwa'), t('Confirmed', 'Imethibitishwa'), t('Rider found', 'Dereva amepatikana'), t('Fee confirmed', 'Ada imethibitishwa'), t('On the way', 'Njiani'), t('Arrived', 'Imefika')];

  const load = useCallback(async () => { try { const r = await orders.get(id); setOrder(r.order); } catch {} }, [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const evs = ['order:confirmed', 'order:fee', 'order:picked', 'order:delivered', 'order:rejected', 'payment:paid'];
    const offs = evs.map((e) => on(e, () => load()));
    const offLoc = on('delivery:location', (d: any) => setRiderPos({ lat: d.lat, lng: d.lng }));
    return () => { offs.forEach((o) => o?.()); offLoc?.(); };
  }, [on, load]);

  if (!order) return <div className="min-h-screen bg-sand"><Spinner /></div>;

  const idx = stepIndex(order.status);
  const cancelled = order.status === 'CANCELLED';
  const paid = order.payment?.status === 'PAID';
  const rd = order.delivery?.rider;
  const showFee = order.status === 'RIDER_ACCEPTED';
  const tracking = ['FEE_CONFIRMED', 'PICKED'].includes(order.status);

  async function confirmFee() { setBusy(true); try { await orders.confirmFee(id); toast.success(t('Fee confirmed — rider is on the way', 'Ada imethibitishwa — dereva anakuja')); await load(); } catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setBusy(false); } }
  async function pay(provider: string) { setBusy(true); try { await orders.pay(id, { provider }); toast.success(provider === 'CASH' ? t("You'll pay cash", 'Utalipa cash') : t('Check your phone to pay', 'Angalia simu kulipa')); setTimeout(load, 2000); } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); } }
  async function complete() { try { await orders.complete(id); toast.success(t('Thank you!', 'Asante!')); load(); } catch (e: any) { toast.error(e?.message); } }
  async function review(n: number) { setStars(n); try { await orders.review(id, { supplierRating: n, riderRating: n }); toast.success(t('Thanks for the rating!', 'Asante!')); } catch {} }

  const markers: MapMarker[] = [];
  if (order.address) markers.push({ lat: order.address.lat, lng: order.address.lng, kind: 'dest', label: t('Your location', 'Eneo lako'), name: t('Your location', 'Eneo lako') });
  if (order.supplier?.lat != null) markers.push({ lat: order.supplier.lat, lng: order.supplier.lng, kind: 'vendor', label: order.supplier.businessName, name: order.supplier.businessName, shop: order.supplier.businessName, phone: order.supplier.phone });
  const rp = riderPos ?? (order.delivery?.riderLat != null ? { lat: order.delivery.riderLat, lng: order.delivery.riderLng } : null);
  if (rp) markers.push({ lat: rp.lat, lng: rp.lng, kind: 'rider', label: rd?.name, name: rd?.name, phone: rd?.phone, photo: rd?.profilePicUrl, plate: rd?.riderProfile?.plateNo });

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
                    {i < STEPS.length - 1 && <span className={cn('h-6 w-0.5', i < idx ? 'bg-leaf' : 'bg-black/10')} />}
                  </div>
                  <span className={cn('text-sm', done ? 'font-semibold' : 'text-ink/50')}>{label}</span>
                </div>
              );
            })}
          </Card>
        ) : (
          <Card className="border-danger/30 !bg-danger/5 text-center"><p className="font-semibold text-danger">{t('This order was cancelled', 'Oda hii ilighairiwa')}</p>{order.cancelReason && <p className="mt-1 text-sm text-ink/60">{order.cancelReason}</p>}</Card>
        )}

        {/* payment status (gas paid at checkout) */}
        {!cancelled && (
          paid ? <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-leaf-dark"><Check size={16} /> {t('Gas paid', 'Gesi imelipwa')}</div> :
          order.payment?.provider === 'CASH' ? <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-ink/60"><Banknote size={15} /> {t('Cash on delivery', 'Cash ukipokea')}</div> :
          <Card><div className="mb-2 text-sm font-semibold">{t('Complete payment', 'Kamilisha malipo')}</div><div className="grid grid-cols-2 gap-2"><Button variant="primary" loading={busy} onClick={() => pay('MPESA')}><Smartphone size={16} /> {t('Mobile money', 'Pesa za simu')}</Button><Button variant="ghost" loading={busy} onClick={() => pay('CASH')}><Banknote size={16} /> {t('Cash', 'Cash')}</Button></div></Card>
        )}

        {/* rider card once assigned */}
        {rd && idx >= 2 && !['DELIVERED', 'COMPLETED'].includes(order.status) && (
          <Card className="flex items-center gap-3">
            <Avatar name={rd.name} url={rd.profilePicUrl} />
            <div className="flex-1 min-w-0"><div className="font-semibold">{rd.name}</div><div className="text-xs text-ink/50">{rd.riderProfile?.plateNo ?? rd.riderProfile?.vehicleType} · ⭐ {rd.riderProfile?.rating ? rd.riderProfile.rating.toFixed(1) : t('New', 'Mpya')}</div></div>
            <a href={`tel:${rd.phone}`} className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-leaf/15 text-leaf"><Phone size={18} /></a>
          </Card>
        )}

        {/* FEE CONFIRMATION */}
        {showFee && (
          <Card className="border-flame/40">
            <div className="flex items-center gap-2 font-bold text-flame"><HandCoins size={18} /> {t('Confirm the rider fee', 'Thibitisha ada ya dereva')}</div>
            <div className="my-2 text-center"><Money value={order.deliveryFee} className="text-3xl text-ink" /></div>
            <p className="mb-3 text-center text-xs text-ink/50">{t('Paid to the rider on delivery. Confirm to start.', 'Hulipwa dereva ukipokea. Thibitisha kuanza.')}</p>
            <Button variant="primary" loading={busy} onClick={confirmFee} className="w-full">{t('Confirm fee & start delivery', 'Thibitisha & anza')}</Button>
          </Card>
        )}

        {/* OTP */}
        {order.delivery?.otp && tracking && (
          <Card className="bg-grad-brand text-white">
            <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck size={18} /> {t('Show this code to the rider', 'Mwoneshe dereva namba hii')}</div>
            <div className="mt-1 text-center text-4xl font-extrabold tracking-[.3em]">{order.delivery.otp}</div>
          </Card>
        )}

        {/* LIVE MAP */}
        {tracking && markers.length > 0 && <Card className="!p-1.5"><Map markers={markers} height={240} /></Card>}

        {/* receipt */}
        <Card>
          {order.items?.map((it: any) => <div key={it.id} className="flex justify-between gap-2 text-sm"><span className="min-w-0 truncate text-ink/70">{it.qty}× {it.brand} {it.productName}</span><Money value={it.lineTotal} className="flex-shrink-0 text-xs" /></div>)}
          <div className="mt-2 border-t border-black/5 pt-2 text-sm">
            <div className="flex justify-between text-ink/60"><span>{t('Gas', 'Gesi')}</span><Money value={order.itemsTotal} className="text-xs" /></div>
            <div className="flex justify-between text-ink/60"><span>{t('Rider fee', 'Ada ya dereva')}</span><Money value={order.deliveryFee} className="text-xs" /></div>
            <div className="mt-1 flex justify-between font-bold"><span>{t('Total', 'Jumla')}</span><Money value={order.total} /></div>
          </div>
        </Card>

        {order.status === 'DELIVERED' && <Button variant="leaf" onClick={complete} className="w-full">{t('Confirm I received the gas', 'Thibitisha nimepokea gesi')}</Button>}
        {['DELIVERED', 'COMPLETED'].includes(order.status) && !order.review && (
          <Card className="text-center">
            <div className="mb-2 text-sm font-semibold">{t('Rate the rider and vendor', 'Mpe nyota dereva na muuzaji')}</div>
            <div className="flex justify-center gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => review(n)}><Star size={30} className={cn(n <= stars ? 'fill-ember text-ember' : 'text-black/20')} /></button>)}</div>
          </Card>
        )}
      </div>
    </div>
  );
}
