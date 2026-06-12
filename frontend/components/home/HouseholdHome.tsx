'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { MapPin, Star, BadgeCheck, Search, Navigation, Package, List, Map as MapIcon, HandCoins, Bike, Smartphone, Banknote, RotateCcw } from 'lucide-react';
import { vendors, orders, addresses, ads, getAccessToken, JikoUser, type BrandAd } from '../../lib/api';
import { useSocket } from '../../lib/useSocket';
import { useT } from '../../lib/i18n';
import { getDeviceLocation, distanceM, prettyDistance } from '../../lib/location';
import { reverseGeocode } from '../../lib/geocode';
import { AppHeader } from '../AppHeader';
import { RoleNav } from '../RoleNav';
import { Card, Pill, Spinner, EmptyState, Money, Badge, Button, cn } from '../ui';

const Map = dynamic(() => import('../Map'), { ssr: false });
const DAR = { lat: -6.7924, lng: 39.2083 };
const MISMATCH_M = 300; // prompt when device is more than this far from the saved location

export function HouseholdHome({ user }: { user: JikoUser }) {
  const { t } = useT();
  const router = useRouter();
  const { on } = useSocket(getAccessToken());

  const [savedAddr, setSavedAddr] = useState<any>(null);   // the single canonical delivery location
  const [mismatchM, setMismatchM] = useState<number | null>(null);
  const [locBusy, setLocBusy]   = useState(false);
  const [brands, setBrands]     = useState<string[]>([]);
  const [sizes, setSizes]       = useState<number[]>([]);
  const [filter, setFilter]     = useState<{ type: string; brand: string; sizeKg: string }>({ type: '', brand: '', sizeKg: '' });
  const [vlist, setVlist]       = useState<any[] | null>(null);
  const [recent, setRecent]     = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [view, setView]         = useState<'list' | 'map'>('list');
  const [busy, setBusy]         = useState(false);
  const [ad, setAd]             = useState<BrandAd | null>(null); // sponsored brand (Phase 3)

  const TYPES = [
    { v: 'REFILL', l: t('Refill', 'Refill') },
    { v: 'CYLINDER', l: t('New cylinder', 'Mtungi mpya') },
    { v: 'ACCESSORY', l: t('Accessories', 'Vifaa') },
  ];
  const center = savedAddr ? { lat: savedAddr.lat, lng: savedAddr.lng } : DAR;

  const loadOrders = useCallback(() => { orders.list().then((r) => setRecent(r.orders ?? [])).catch(() => {}); }, []);
  const active = recent.find((o) => !['COMPLETED', 'CANCELLED'].includes(o.status));

  // ── Load the saved delivery location; create it from GPS on first use ──────────
  const loadSaved = useCallback(async () => {
    const r = await addresses.list().catch(() => ({ addresses: [] }));
    let def = (r.addresses ?? []).find((a: any) => a.isDefault) ?? (r.addresses ?? [])[0];
    if (!def) {
      // No saved location yet → capture the device's accurate position once.
      try {
        const d = await getDeviceLocation();
        const g = await reverseGeocode(d.lat, d.lng);
        const created = await addresses.current({ lat: d.lat, lng: d.lng, label: t('Home', 'Nyumbani'), region: g?.region, district: g?.district, ward: g?.ward });
        def = created.address;
      } catch { /* leave unset — user can tap GPS */ }
    }
    setSavedAddr(def ?? null);
    return def ?? null;
  }, [t]);

  useEffect(() => {
    vendors.products().then((r) => { setBrands(r.brands ?? []); setSizes(r.sizes ?? []); }).catch(() => {});
    ads.active(user.region ?? undefined).then((r) => setAd(r.ad)).catch(() => {});
    loadOrders();
    loadSaved();
  }, [loadOrders, loadSaved, user.region]);

  // Tap a sponsored brand → filter search to it (re-runs via the filter effect)
  // and attribute the click for the advertiser's billing.
  function openAd() {
    if (!ad) return;
    ads.click(ad.id).catch(() => {});
    setFilter((f) => ({ ...f, brand: ad.brand, type: (ad.type as string) || f.type }));
    toast.success(t(`Showing ${ad.brand} vendors`, `Inaonyesha wauzaji wa ${ad.brand}`));
  }

  // ── Compare device position to the saved one → prompt if far apart ─────────────
  useEffect(() => {
    if (!savedAddr) return;
    let alive = true;
    getDeviceLocation().then((d) => {
      if (!alive) return;
      const m = distanceM(d, { lat: savedAddr.lat, lng: savedAddr.lng });
      setMismatchM(m > MISMATCH_M ? m : null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [savedAddr?.id]);

  const search = useCallback(async () => {
    setSearching(true);
    try {
      const r = await vendors.search({ lat: center.lat, lng: center.lng, type: filter.type || undefined, brand: filter.brand || undefined, sizeKg: filter.sizeKg ? Number(filter.sizeKg) : undefined, radiusKm: 50 });
      setVlist(r.vendors ?? []);
    } catch { setVlist([]); } finally { setSearching(false); }
  }, [center.lat, center.lng, filter]);

  // Show nearby available vendors automatically (and re-run when location/filters change).
  useEffect(() => { search(); }, [search]);

  useEffect(() => {
    const evs = ['order:confirmed', 'order:fee', 'order:picked', 'order:delivered', 'order:rejected', 'payment:paid'];
    const offs = evs.map((e) => on(e, () => loadOrders()));
    return () => offs.forEach((o) => o?.());
  }, [on, loadOrders]);

  // ── Update the saved location to the device's current accurate position ────────
  async function useCurrentLocation() {
    setLocBusy(true);
    try {
      const d = await getDeviceLocation();
      const g = await reverseGeocode(d.lat, d.lng);
      const r = await addresses.current({ lat: d.lat, lng: d.lng, region: g?.region, district: g?.district, ward: g?.ward });
      setSavedAddr(r.address); setMismatchM(null);
      toast.success(t('Delivery location updated', 'Eneo la kupokelea limesasishwa'));
    } catch { toast.error(t("Couldn't get your location", 'Imeshindwa kupata eneo')); } finally { setLocBusy(false); }
  }

  // 1-tap reorder: re-place a past order at the current vendor/stock + address.
  const [reordering, setReordering] = useState<string | null>(null);
  async function reorder(o: any) {
    setReordering(o.id);
    try {
      const r = await orders.reorder(o.id);
      toast.success(r.skipped?.length
        ? t('Reordered — some items were unavailable', 'Imeagizwa tena — baadhi hayakupatikana')
        : t('Reordered! Complete payment', 'Imeagizwa tena! Kamilisha malipo'));
      loadOrders();
      if (r.order?.id) router.push(`/order/${r.order.id}`);
    } catch (e: any) {
      toast.error(e?.message ?? t('Could not reorder', 'Imeshindwa kuagiza tena'));
    } finally { setReordering(null); }
  }

  async function confirmFee() { if (!active) return; setBusy(true); try { await orders.confirmFee(active.id); toast.success(t('Fee confirmed — rider is on the way', 'Ada imethibitishwa — dereva anakuja')); loadOrders(); } catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setBusy(false); } }
  async function payNow(provider: string) { if (!active) return; setBusy(true); try { await orders.pay(active.id, { provider }); toast.success(provider === 'CASH' ? t("You'll pay cash", 'Utalipa cash') : t('Check your phone to pay', 'Angalia simu kulipa')); setTimeout(loadOrders, 2000); } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); } }

  const markers = (vlist ?? []).filter((v) => v.lat != null).map((v) => ({ lat: v.lat, lng: v.lng, kind: 'vendor' as const, label: v.businessName, id: v.supplierId, shop: v.businessName }))
    .concat([{ lat: center.lat, lng: center.lng, kind: 'me' as const, label: savedAddr?.label ?? t('You', 'Wewe'), id: '', shop: '' }]);

  return (
    <div className="min-h-screen pb-24">
      <AppHeader title="JIKO CONNECT" subtitle={`${t('Hi', 'Habari')}, ${user.name ?? t('customer', 'mteja')}`} />

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        {/* saved delivery location */}
        <Card className="flex items-center gap-3 !p-3">
          <MapPin className="text-flame flex-shrink-0" size={20} />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-ink/50">{t('Deliver to (saved)', 'Inaletwa (iliyohifadhiwa)')}</div>
            <div className="truncate text-sm font-semibold">{savedAddr ? [savedAddr.label, savedAddr.ward, savedAddr.district].filter(Boolean).join(' · ') : t('Tap GPS to set your location', 'Bonyeza GPS kuweka eneo')}</div>
          </div>
          <button onClick={useCurrentLocation} disabled={locBusy} className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-flame/10 text-flame disabled:opacity-50"><Navigation size={17} className={locBusy ? 'animate-pulse' : ''} /></button>
        </Card>

        {/* sponsored brand (Phase 3 monetization) */}
        {ad && (
          <button onClick={openAd} className="block w-full text-left">
            <div className="relative overflow-hidden rounded-2xl bg-grad-brand p-4 text-white shadow-ds-card">
              <span className="absolute right-2 top-2 rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">{t('Sponsored', 'Tangazo')}</span>
              <div className="flex items-center gap-3">
                {ad.imageUrl
                  ? <img src={ad.imageUrl} alt={ad.brand} className="h-12 w-12 flex-shrink-0 rounded-xl bg-white/10 object-cover" />
                  : <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-xl bg-white/15 text-lg font-extrabold">{ad.brand.slice(0, 2).toUpperCase()}</span>}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-extrabold">{ad.title}</div>
                  {ad.subtitle && <div className="truncate text-xs text-white/80">{ad.subtitle}</div>}
                </div>
                <span className="flex-shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-flame">{ad.ctaLabel || t('Shop', 'Nunua')}</span>
              </div>
            </div>
          </button>
        )}

        {/* mismatch prompt — device is somewhere else */}
        {mismatchM != null && savedAddr && (
          <Card className="border-flame/40 !bg-flame/5">
            <div className="text-sm"><span className="font-semibold">{t("You're about", 'Uko takriban')} {prettyDistance(mismatchM)} {t('from', 'kutoka')} {savedAddr.label}.</span> {t('Deliver to where you are now, or keep your saved location?', 'Uletewe ulipo sasa, au ubaki na eneo lililohifadhiwa?')}</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="primary" loading={locBusy} onClick={useCurrentLocation}><Navigation size={15} /> {t('Deliver here', 'Lete hapa')}</Button>
              <Button variant="ghost" onClick={() => setMismatchM(null)}>{t('Keep saved', 'Baki na hii')}</Button>
            </div>
          </Card>
        )}

        {/* active order */}
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
                <Button variant="primary" loading={busy} onClick={confirmFee} className="w-full">{t('Confirm & start', 'Thibitisha & anza')}</Button>
              </div>
            ) : ['FEE_CONFIRMED', 'PICKED'].includes(active.status) ? (
              <div className="mt-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-leaf-dark"><Bike size={15} /> {active.status === 'PICKED' ? t('Rider on the way', 'Dereva njiani') : t('Rider heading to pickup', 'Dereva anaenda kuchukua')}</span>
                <Link href={`/order/${active.id}`} className="text-xs font-semibold text-flame">{t('Track live', 'Fuatilia')}</Link>
              </div>
            ) : active.status === 'DELIVERED' ? (
              <Link href={`/order/${active.id}`}><Button variant="leaf" className="mt-3 w-full">{t('Confirm & rate', 'Thibitisha & toa nyota')}</Button></Link>
            ) : (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm text-ink/60">{['ACCEPTED', 'RIDER_OFFERED'].includes(active.status) ? t('Finding a rider…', 'Inatafuta dereva…') : t('Waiting for vendor…', 'Inasubiri muuzaji…')}</span>
                <Link href={`/order/${active.id}`} className="text-xs font-semibold text-flame">{t('View', 'Angalia')}</Link>
              </div>
            )}
          </Card>
        )}

        {/* filters */}
        <div className="flex gap-2">
          <Pill active={!filter.type} onClick={() => setFilter((f) => ({ ...f, type: '' }))}>{t('All', 'Zote')}</Pill>
          {TYPES.map((ty) => <Pill key={ty.v} active={filter.type === ty.v} onClick={() => setFilter((f) => ({ ...f, type: f.type === ty.v ? '' : ty.v }))}>{ty.l}</Pill>)}
        </div>
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

        {/* results loading skeleton (feels instant vs a blank wait) */}
        {searching && vlist === null && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Card key={i}><div className="h-14 animate-pulse rounded-xl bg-black/5 dark:bg-white/5" /></Card>
            ))}
          </div>
        )}

        {/* recent orders */}
        {vlist === null && !searching && recent.filter((o) => o.id !== active?.id).length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink/70">{t('Your recent orders', 'Oda zako za hivi karibuni')}</h2>
              <Link href="/orders" className="text-xs font-semibold text-flame">{t('All', 'Zote')}</Link>
            </div>
            <div className="space-y-2">
              {recent.filter((o) => o.id !== active?.id).slice(0, 3).map((o) => (
                <Card key={o.id} className="flex items-center justify-between gap-3 !p-3">
                  <Link href={`/order/${o.id}`} className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{o.supplier?.businessName}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink/50"><Money value={o.total} className="text-xs" /> · <Badge status={o.status} /></div>
                  </Link>
                  <Button variant="primary" loading={reordering === o.id} onClick={() => reorder(o)} className="flex-shrink-0 !px-3.5">
                    <RotateCcw size={15} /> {t('Reorder', 'Agiza tena')}
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* results */}
        {vlist !== null && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink/70">{vlist.length} {t('vendors near your location', 'wauzaji karibu na eneo lako')}</h2>
              <div className="flex items-center rounded-full bg-black/5 p-0.5 text-xs font-bold">
                <button onClick={() => setView('list')} className={cn('flex items-center gap-1 rounded-full px-2.5 py-1', view === 'list' ? 'bg-flame text-white' : 'text-ink/50')}><List size={13} /> {t('List', 'Orodha')}</button>
                <button onClick={() => setView('map')} className={cn('flex items-center gap-1 rounded-full px-2.5 py-1', view === 'map' ? 'bg-flame text-white' : 'text-ink/50')}><MapIcon size={13} /> {t('Map', 'Ramani')}</button>
              </div>
            </div>
            {vlist.length === 0 ? <EmptyState icon={<Package size={36} />} title={t('No vendor with stock nearby', 'Hakuna muuzaji mwenye stock karibu')} sub={t('Try another brand or size.', 'Jaribu brand au saizi nyingine.')} /> :
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
                              <span>·</span><span className="inline-flex items-center gap-0.5"><MapPin size={11} /> {v.distanceKm < 1 ? `${Math.round(v.distanceKm * 1000)} m` : `${v.distanceKm} km`}</span>
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
