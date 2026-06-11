'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { MapPin, Star, BadgeCheck, Search, Navigation, Package, List, Map as MapIcon, HandCoins, Bike, Smartphone, Banknote } from 'lucide-react';
import { vendors, orders, addresses, getAccessToken, JikoUser } from '../../lib/api';
import { useSocket } from '../../lib/useSocket';
import { useT } from '../../lib/i18n';
import { AppHeader } from '../AppHeader';
import { RoleNav } from '../RoleNav';
import { Card, Pill, Spinner, EmptyState, Money, Badge, Button, cn } from '../ui';

const Map = dynamic(() => import('../Map'), { ssr: false });
const DAR = { lat: -6.7924, lng: 39.2083 };

function dist(km: number, t: (e: string, s: string) => string): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km · ${Math.round(km * 1000).toLocaleString()} m`;
}

export function HouseholdHome({ user }: { user: JikoUser }) {
  const { t } = useT();
  const router = useRouter();
  const { on } = useSocket(getAccessToken());
  const [coords, setCoords] = useState(DAR);
  const [brands, setBrands] = useState<string[]>([]);
  const [sizes, setSizes]   = useState<number[]>([]);
  const [filter, setFilter] = useState<{ type: string; brand: string; sizeKg: string }>({ type: 'REFILL', brand: '', sizeKg: '' });
  const [vlist, setVlist]   = useState<any[] | null>(null);
  const [addrs, setAddrs]   = useState<any[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [view, setView]     = useState<'list' | 'map'>('list');
  const [busy, setBusy]     = useState(false);

  const loadOrders = useCallback(() => { orders.list().then((r) => setRecent(r.orders ?? [])).catch(() => {}); }, []);
  const active = recent.find((o) => !['COMPLETED', 'CANCELLED'].includes(o.status));

  useEffect(() => {
    const evs = ['order:confirmed', 'order:fee', 'order:picked', 'order:delivered', 'order:rejected', 'payment:paid'];
    const offs = evs.map((e) => on(e, () => loadOrders()));
    return () => offs.forEach((o) => o?.());
  }, [on, loadOrders]);

  async function confirmFee() {
    if (!active) return;
    setBusy(true);
    try { await orders.confirmFee(active.id); toast.success(t('Fee confirmed — rider is on the way', 'Ada imethibitishwa — dereva anakuja')); loadOrders(); }
    catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setBusy(false); }
  }
  async function payNow(provider: string) {
    if (!active) return;
    setBusy(true);
    try { await orders.pay(active.id, { provider }); toast.success(provider === 'CASH' ? t("You'll pay cash", 'Utalipa cash') : t('Check your phone to pay', 'Angalia simu kulipa')); setTimeout(loadOrders, 2000); }
    catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
  }

  const TYPES = [
    { v: 'REFILL', l: t('Refill', 'Refill') },
    { v: 'CYLINDER', l: t('New cylinder', 'Mtungi mpya') },
    { v: 'ACCESSORY', l: t('Accessories', 'Vifaa') },
  ];
  const defaultAddr = addrs.find((a) => a.isDefault) ?? addrs[0];

  useEffect(() => {
    vendors.products().then((r) => { setBrands(r.brands ?? []); setSizes(r.sizes ?? []); }).catch(() => {});
    addresses.list().then((r) => setAddrs(r.addresses ?? [])).catch(() => {});
    loadOrders();
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { timeout: 6000 });
  }, []);

  const search = useCallback(async () => {
    setSearching(true);
    try {
      const r = await vendors.search({ lat: coords.lat, lng: coords.lng, type: filter.type, brand: filter.brand || undefined, sizeKg: filter.sizeKg ? Number(filter.sizeKg) : undefined, radiusKm: 25 });
      setVlist(r.vendors ?? []);
    } catch { setVlist([]); } finally { setSearching(false); }
  }, [coords, filter]);

  async function useMyLocation() {
    if (!navigator.geolocation) return toast.error(t('GPS unavailable', 'GPS haipatikani'));
    navigator.geolocation.getCurrentPosition(async (p) => {
      const lat = p.coords.latitude, lng = p.coords.longitude;
      setCoords({ lat, lng });
      if (!defaultAddr) {
        try { await addresses.create({ label: t('Home', 'Nyumbani'), lat, lng, region: user.region ?? 'Dar es Salaam', isDefault: true }); const r = await addresses.list(); setAddrs(r.addresses ?? []); toast.success(t('Address saved', 'Anwani imehifadhiwa')); } catch {}
      } else { toast.success(t('Location updated', 'Eneo limesasishwa')); }
    }, () => toast.error(t("Couldn't get location", 'Imeshindwa kupata eneo')));
  }

  const markers = (vlist ?? []).filter((v) => v.lat != null).map((v) => ({ lat: v.lat, lng: v.lng, kind: 'vendor' as const, label: v.businessName, id: v.supplierId }))
    .concat([{ lat: coords.lat, lng: coords.lng, kind: 'me' as const, label: t('You', 'Wewe'), id: '' }]);

  return (
    <div className="min-h-screen pb-24">
      <AppHeader title="JIKO CONNECT" subtitle={`${t('Hi', 'Habari')}, ${user.name ?? t('customer', 'mteja')}`} />

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        {/* location bar */}
        <Card className="flex items-center gap-3 !p-3">
          <MapPin className="text-flame flex-shrink-0" size={20} />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-ink/50">{t('Delivering to', 'Inaletwa kwenda')}</div>
            <div className="truncate text-sm font-semibold">{defaultAddr ? (defaultAddr.label + (defaultAddr.ward ? ` · ${defaultAddr.ward}` : '')) : t('No address — tap GPS', 'Hakuna anwani — bonyeza GPS')}</div>
          </div>
          <button onClick={useMyLocation} className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-flame/10 text-flame"><Navigation size={17} /></button>
        </Card>

        {/* active order — actions surfaced right here on the dashboard */}
        {active && (
          <Card className="border-flame/40">
            <div className="flex items-center justify-between">
              <div className="min-w-0"><div className="font-bold">{active.orderNo}</div><div className="truncate text-xs text-ink/50">{active.supplier?.businessName}</div></div>
              <Badge status={active.status} />
            </div>

            {active.payment?.status !== 'PAID' && active.payment?.provider !== 'CASH' ? (
              <div className="mt-3">
                <div className="mb-1.5 text-xs font-medium text-ink/60">{t('Complete payment for your gas', 'Kamilisha malipo ya gesi')}</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="primary" loading={busy} onClick={() => payNow('MPESA')}><Smartphone size={15} /> {t('Mobile money', 'Pesa za simu')}</Button>
                  <Button variant="ghost" loading={busy} onClick={() => payNow('CASH')}><Banknote size={15} /> {t('Cash', 'Cash')}</Button>
                </div>
              </div>
            ) : active.status === 'RIDER_ACCEPTED' ? (
              <div className="mt-3 rounded-xl bg-flame/5 p-3">
                <div className="flex items-center gap-2 text-sm font-bold text-flame"><HandCoins size={16} /> {t('Confirm the rider fee', 'Thibitisha ada ya dereva')}</div>
                <div className="my-1 text-center"><Money value={active.deliveryFee} className="text-2xl" /></div>
                <Button variant="primary" loading={busy} onClick={confirmFee} className="w-full">{t('Confirm fee & start delivery', 'Thibitisha & anza')}</Button>
              </div>
            ) : ['FEE_CONFIRMED', 'PICKED'].includes(active.status) ? (
              <div className="mt-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-leaf-dark"><Bike size={15} /> {active.status === 'PICKED' ? t('Rider on the way', 'Dereva njiani') : t('Rider heading to pickup', 'Dereva anaenda kuchukua')}</span>
                <Link href={`/order/${active.id}`} className="text-xs font-semibold text-flame">{t('Track live', 'Fuatilia')}</Link>
              </div>
            ) : active.status === 'DELIVERED' ? (
              <Link href={`/order/${active.id}`}><Button variant="leaf" className="mt-3 w-full">{t('Confirm receipt & rate', 'Thibitisha & toa nyota')}</Button></Link>
            ) : (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm text-ink/60">{['ACCEPTED', 'RIDER_OFFERED'].includes(active.status) ? t('Finding a rider…', 'Inatafuta dereva…') : t('Waiting for vendor…', 'Inasubiri muuzaji…')}</span>
                <Link href={`/order/${active.id}`} className="text-xs font-semibold text-flame">{t('View', 'Angalia')}</Link>
              </div>
            )}
          </Card>
        )}

        {/* type chips */}
        <div className="flex gap-2">
          {TYPES.map((ty) => <Pill key={ty.v} active={filter.type === ty.v} onClick={() => setFilter((f) => ({ ...f, type: ty.v }))}>{ty.l}</Pill>)}
        </div>

        {/* brand + size dropdowns */}
        <div className={cn('grid gap-2', filter.type === 'ACCESSORY' ? 'grid-cols-1' : 'grid-cols-2')}>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink/50">{t('Brand', 'Brand')}</span>
            <select value={filter.brand} onChange={(e) => setFilter((f) => ({ ...f, brand: e.target.value }))} className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-flame">
              <option value="">{t('All brands', 'Brand zote')}</option>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          {filter.type !== 'ACCESSORY' && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink/50">{t('Size', 'Saizi')}</span>
              <select value={filter.sizeKg} onChange={(e) => setFilter((f) => ({ ...f, sizeKg: e.target.value }))} className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-flame">
                <option value="">{t('All sizes', 'Saizi zote')}</option>
                {sizes.map((s) => <option key={s} value={s}>{s} kg</option>)}
              </select>
            </label>
          )}
        </div>

        <Button variant="primary" className="w-full" loading={searching} onClick={search}><Search size={17} /> {t('Search vendors', 'Tafuta wauzaji')}</Button>

        {/* recent orders (before any search) */}
        {vlist === null && recent.filter((o) => o.id !== active?.id).length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink/70">{t('Your recent orders', 'Oda zako za hivi karibuni')}</h2>
              <Link href="/orders" className="text-xs font-semibold text-flame">{t('All', 'Zote')}</Link>
            </div>
            <div className="space-y-2">
              {recent.filter((o) => o.id !== active?.id).slice(0, 3).map((o) => (
                <Link key={o.id} href={`/order/${o.id}`}>
                  <Card className="flex items-center justify-between !p-3">
                    <div className="min-w-0"><div className="text-sm font-semibold">{o.orderNo}</div><div className="truncate text-xs text-ink/50">{o.supplier?.businessName}</div></div>
                    <div className="flex-shrink-0 text-right"><Money value={o.total} className="text-sm" /><div className="mt-1"><Badge status={o.status} /></div></div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* results */}
        {vlist !== null && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink/70">{vlist.length} {t('vendors near you', 'wauzaji karibu')}</h2>
              <div className="flex items-center rounded-full bg-black/5 p-0.5 text-xs font-bold">
                <button onClick={() => setView('list')} className={cn('flex items-center gap-1 rounded-full px-2.5 py-1', view === 'list' ? 'bg-flame text-white' : 'text-ink/50')}><List size={13} /> {t('List', 'Orodha')}</button>
                <button onClick={() => setView('map')} className={cn('flex items-center gap-1 rounded-full px-2.5 py-1', view === 'map' ? 'bg-flame text-white' : 'text-ink/50')}><MapIcon size={13} /> {t('Map', 'Ramani')}</button>
              </div>
            </div>

            {vlist.length === 0 ? <EmptyState icon={<Package size={36} />} title={t('No vendor with stock nearby', 'Hakuna muuzaji mwenye stock karibu')} sub={t('Try another brand or size, or widen the area.', 'Jaribu brand au saizi nyingine.')} /> :
              view === 'map' ? (
                <Card className="!p-1.5"><Map markers={markers} height={340} onMarkerClick={(id) => id && router.push(`/vendor/${id}`)} /></Card>
              ) : (
                <div className="space-y-3">
                  {vlist.map((v) => (
                    <Link key={v.supplierId} href={`/vendor/${v.supplierId}`}>
                      <Card>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5"><span className="truncate font-bold">{v.businessName}</span>{v.isVerified && <BadgeCheck size={15} className="flex-shrink-0 text-leaf" />}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink/50">
                              <span className="inline-flex items-center gap-0.5"><Star size={12} className="fill-ember text-ember" /> {v.rating ? v.rating.toFixed(1) : t('New', 'Mpya')}</span>
                              <span>·</span><span className="inline-flex items-center gap-0.5"><MapPin size={11} /> {dist(v.distanceKm, t)}</span>
                              <span>·</span><span>~{v.etaMin} {t('min', 'dak')}</span>
                            </div>
                          </div>
                          {v.featured && <span className="flex-shrink-0 rounded-full bg-ember/15 px-2 py-0.5 text-[10px] font-bold text-ember">{t('FEATURED', 'FEATURED')}</span>}
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-3">
                          <span className="text-xs text-ink/50">{t('From', 'Kuanzia')}</span><Money value={v.fromPrice ?? 0} className="text-flame" />
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
          </div>
        )}
      </div>
      <RoleNav role="HOUSEHOLD" />
    </div>
  );
}
