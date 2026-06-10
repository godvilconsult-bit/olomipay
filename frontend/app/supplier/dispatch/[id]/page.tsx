'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { ArrowLeft, Star, Phone, Bike, MapPin, Check, BadgeCheck } from 'lucide-react';
import { suppliers, getAccessToken } from '../../../../lib/api';
import { useSocket } from '../../../../lib/useSocket';
import { useT } from '../../../../lib/i18n';
import { localPhone } from '../../../../lib/utils';
import { Card, Button, Spinner, EmptyState, Money, Badge, cn } from '../../../../components/ui';
import type { MapMarker } from '../../../../components/Map';

const Map = dynamic(() => import('../../../../components/Map'), { ssr: false });

function Avatar({ name, url, size = 44 }: { name?: string; url?: string; size?: number }) {
  if (url) return <img src={url} alt={name ?? ''} width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  const initials = (name ?? '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  return <span className="grid flex-shrink-0 place-items-center rounded-full bg-flame/15 font-bold text-flame" style={{ width: size, height: size }}>{initials}</span>;
}

export default function DispatchPage() {
  const router = useRouter();
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const { on } = useSocket(getAccessToken());
  const [order, setOrder]   = useState<any>(null);
  const [shop, setShop]     = useState<{ lat: number; lng: number } | null>(null);
  const [riders, setRiders] = useState<any[]>([]);
  const [busy, setBusy]     = useState<string | null>(null);
  const [riderPos, setRiderPos] = useState<{ lat: number; lng: number } | null>(null);

  const load = useCallback(async () => {
    const o = (await suppliers.orders().catch(() => ({ orders: [] }))).orders.find((x: any) => x.id === id);
    setOrder(o ?? null);
    if (o && ['ACCEPTED', 'RIDER_OFFERED'].includes(o.status)) {
      const r = await suppliers.ridersNearby().catch(() => ({ riders: [], shop: null }));
      setRiders(r.riders ?? []); setShop(r.shop ?? null);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const evs = ['order:rider-accepted', 'rider:declined', 'order:tracking', 'order:picked', 'order:delivered'];
    const offs = evs.map((e) => on(e, () => load()));
    const offLoc = on('delivery:location', (d: any) => setRiderPos({ lat: d.lat, lng: d.lng }));
    return () => { offs.forEach((o) => o?.()); offLoc?.(); };
  }, [on, load]);

  async function assign(riderId: string) {
    setBusy(riderId);
    try { await suppliers.assignRider(id, riderId); toast.success(t('Rider offered the job', 'Dereva amepewa kazi')); await load(); }
    catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setBusy(null); }
  }

  if (!order) return <div className="min-h-screen bg-sand"><Spinner /></div>;

  const picking  = ['ACCEPTED', 'RIDER_OFFERED'].includes(order.status);
  const tracking = ['FEE_CONFIRMED', 'PICKED'].includes(order.status);
  const rd = order.delivery?.rider;

  const trackMarkers: MapMarker[] = [];
  if (order.address) trackMarkers.push({ lat: order.address.lat, lng: order.address.lng, kind: 'dest', label: t('Household', 'Kaya') });
  if (shop?.lat != null) trackMarkers.push({ lat: shop.lat, lng: shop.lng, kind: 'vendor', label: t('Your shop', 'Duka lako') });
  const rp = riderPos ?? (order.delivery?.riderLat != null ? { lat: order.delivery.riderLat, lng: order.delivery.riderLng } : null);
  if (rp) trackMarkers.push({ lat: rp.lat, lng: rp.lng, kind: 'rider', label: rd?.name });

  const pickerMarkers: MapMarker[] = [];
  if (shop?.lat != null) pickerMarkers.push({ lat: shop.lat, lng: shop.lng, kind: 'vendor', label: t('Your shop', 'Duka lako') });
  riders.filter((r) => r.lat != null).forEach((r) => pickerMarkers.push({ lat: r.lat, lng: r.lng, kind: 'rider', label: r.name, id: r.riderId }));

  return (
    <div className="min-h-screen bg-sand pb-10">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/90 px-4 py-3 backdrop-blur">
        <button onClick={() => router.replace('/dashboard')} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5"><ArrowLeft size={18} /></button>
        <div><div className="font-extrabold">{order.orderNo}</div><div className="text-xs text-ink/50">{order.address?.label}</div></div>
        <div className="ml-auto"><Badge status={order.status} /></div>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        {picking && (
          <>
            {pickerMarkers.length > 0 && <Card className="!p-1.5"><Map markers={pickerMarkers} height={220} onMarkerClick={(rid) => rid && assign(rid)} /></Card>}
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink/70"><Bike size={15} /> {t('Available riders near you', 'Madereva walio karibu')}</h2>
            {riders.length === 0 ? <EmptyState icon={<Bike size={34} />} title={t('No riders online nearby', 'Hakuna dereva online karibu')} sub={t('Wait for a rider to come online, then refresh.', 'Subiri dereva aje online.')} /> :
              <div className="space-y-2">
                {riders.map((r) => (
                  <Card key={r.riderId} className="flex items-center gap-3 !p-3">
                    <Avatar name={r.name} url={r.photoUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 font-semibold">{r.name ?? localPhone(r.phone)}{r.isVerified && <BadgeCheck size={14} className="text-leaf" />}</div>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-ink/50">
                        <span className="inline-flex items-center gap-0.5"><Star size={11} className="fill-ember text-ember" />{r.rating ? r.rating.toFixed(1) : t('New', 'Mpya')}</span>
                        <span>· {r.plateNo ?? r.vehicleType}</span>
                        {r.distanceKm != null && <span>· {r.distanceKm} km</span>}
                      </div>
                      <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 text-xs font-medium text-flame"><Phone size={11} /> {localPhone(r.phone)}</a>
                    </div>
                    <Button variant="primary" className="!min-h-0 flex-shrink-0 !py-2 !text-sm" loading={busy === r.riderId} onClick={() => assign(r.riderId)} disabled={order.status === 'RIDER_OFFERED' && order.delivery?.riderId === r.riderId}>
                      {order.delivery?.riderId === r.riderId ? t('Offered', 'Imetolewa') : t('Send', 'Tuma')}
                    </Button>
                  </Card>
                ))}
              </div>
            }
            {order.status === 'RIDER_OFFERED' && <p className="text-center text-xs text-ink/50">{t('Offered — waiting for the rider to accept. You can send to another rider.', 'Imetolewa — inasubiri dereva akubali. Unaweza kutuma kwa mwingine.')}</p>}
          </>
        )}

        {order.status === 'RIDER_ACCEPTED' && (
          <Card className="text-center">
            {rd && <div className="mx-auto mb-2 w-fit"><Avatar name={rd.name} url={rd.profilePicUrl} size={56} /></div>}
            <p className="font-semibold">{rd?.name}</p>
            <p className="mt-1 text-sm text-ink/60">{t('Rider accepted. Waiting for the household to confirm the rider fee', 'Dereva amekubali. Inasubiri kaya kuthibitisha ada')} (<Money value={order.deliveryFee} className="text-xs" />).</p>
          </Card>
        )}

        {tracking && (
          <>
            <Card className="flex items-center gap-3">
              <Avatar name={rd?.name} url={rd?.profilePicUrl} />
              <div className="flex-1 min-w-0"><div className="font-semibold">{rd?.name}</div><div className="text-xs text-ink/50">{rd?.riderProfile?.plateNo ?? rd?.riderProfile?.vehicleType}</div></div>
              <a href={`tel:${rd?.phone}`} className="grid h-10 w-10 place-items-center rounded-xl bg-leaf/15 text-leaf"><Phone size={18} /></a>
            </Card>
            <Card className="!p-1.5"><Map markers={trackMarkers} height={300} /></Card>
            <p className="text-center text-sm font-medium text-ink/60">{order.status === 'PICKED' ? t('Rider is on the way to the household 🏍️', 'Dereva yuko njiani kwa kaya 🏍️') : t('Rider heading to pick up', 'Dereva anakuja kuchukua')}</p>
          </>
        )}

        {['DELIVERED', 'COMPLETED'].includes(order.status) && (
          <Card className="text-center"><Check className="mx-auto text-leaf" size={32} /><p className="mt-2 font-semibold">{t('Delivered', 'Imefikishwa')}</p></Card>
        )}
      </div>
    </div>
  );
}
