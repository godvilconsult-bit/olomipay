'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { MapPin, Star, BadgeCheck, Search, Navigation, Package, List, Map as MapIcon, HandCoins, Smartphone, Banknote, RotateCcw, Store, ChevronRight, RefreshCw, Gift, Wallet, Heart, Bell, Flame, Wrench, LogOut, Clock, Loader2 } from 'lucide-react';
import { vendors, orders, addresses, auth, getAccessToken, JikoUser } from '../../lib/api';
import { useSocket } from '../../lib/useSocket';
import { useT, LangToggle } from '../../lib/i18n';
import { getDeviceLocation, distanceM, prettyDistance } from '../../lib/location';
import { reverseGeocode } from '../../lib/geocode';
import { TZ_REGIONS } from '../../lib/tanzania';
import { RoleNav } from '../RoleNav';
import { SponsoredAds } from '../SponsoredAds';
import { Money, Badge, Button, EmptyState, cn } from '../ui';

const Map = dynamic(() => import('../Map'), { ssr: false });
const DAR = { lat: -6.7924, lng: 39.2083 };
const MISMATCH_M = 300;

export function HouseholdHome({ user }: { user: JikoUser }) {
  const { t } = useT();
  const router = useRouter();
  const { on } = useSocket(getAccessToken());

  const [savedAddr, setSavedAddr] = useState<any>(null);
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
  const [adRegion, setAdRegion] = useState(user.region ?? 'Dar es Salaam');
  const regionTouched           = useRef(false);
  const [menu, setMenu]         = useState(false);
  const [reordering, setReordering] = useState<string | null>(null);

  const CATS = [
    { v: 'REFILL',    l: t('Refill', 'Kujaza'),       icon: Flame },
    { v: 'CYLINDER',  l: t('New cylinder', 'Mtungi'), icon: Package },
    { v: 'ACCESSORY', l: t('Accessories', 'Vifaa'),   icon: Wrench },
  ];
  const center = savedAddr ? { lat: savedAddr.lat, lng: savedAddr.lng } : DAR;
  const hour = new Date().getHours();
  const greet = hour < 12 ? t('Good morning', 'Habari za asubuhi') : hour < 17 ? t('Good afternoon', 'Habari za mchana') : t('Good evening', 'Habari za jioni');
  const firstName = (user.name ?? t('there', 'karibu')).split(' ')[0];

  const loadOrders = useCallback(() => { orders.list().then((r) => setRecent(r.orders ?? [])).catch(() => {}); }, []);
  const active = recent.find((o) => !['COMPLETED', 'CANCELLED'].includes(o.status));
  const lastDone = recent.find((o) => o.status === 'COMPLETED');

  const loadSaved = useCallback(async () => {
    const r = await addresses.list().catch(() => ({ addresses: [] }));
    let def = (r.addresses ?? []).find((a: any) => a.isDefault) ?? (r.addresses ?? [])[0];
    if (!def) {
      try {
        const d = await getDeviceLocation();
        const g = await reverseGeocode(d.lat, d.lng);
        const created = await addresses.current({ lat: d.lat, lng: d.lng, label: t('Home', 'Nyumbani'), region: g?.region, district: g?.district, ward: g?.ward });
        def = created.address;
      } catch { /* leave unset */ }
    }
    setSavedAddr(def ?? null);
    // Default the offers region to the household's saved area, unless they picked one.
    if (def?.region && !regionTouched.current) setAdRegion(def.region);
    return def ?? null;
  }, [t]);

  useEffect(() => {
    vendors.products().then((r) => { setBrands(r.brands ?? []); setSizes(r.sizes ?? []); }).catch(() => {});
    loadOrders();
    loadSaved();
  }, [loadOrders, loadSaved]);

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

  useEffect(() => { search(); }, [search]);

  useEffect(() => {
    const evs = ['order:confirmed', 'order:fee', 'order:picked', 'order:delivered', 'order:rejected', 'payment:paid'];
    const offs = evs.map((e) => on(e, () => loadOrders()));
    return () => offs.forEach((o) => o?.());
  }, [on, loadOrders]);

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

  async function reorder(o: any) {
    setReordering(o.id);
    try {
      const r = await orders.reorder(o.id);
      toast.success(r.skipped?.length ? t('Reordered — some items were unavailable', 'Imeagizwa tena — baadhi hayakupatikana') : t('Reordered! Complete payment', 'Imeagizwa tena! Kamilisha malipo'));
      loadOrders();
      if (r.order?.id) router.push(`/order/${r.order.id}`);
    } catch (e: any) { toast.error(e?.message ?? t('Could not reorder', 'Imeshindwa kuagiza tena')); } finally { setReordering(null); }
  }

  async function confirmFee() { if (!active) return; setBusy(true); try { await orders.confirmFee(active.id); toast.success(t('Fee confirmed — rider is on the way', 'Ada imethibitishwa — dereva anakuja')); loadOrders(); } catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setBusy(false); } }
  async function payNow(provider: string) { if (!active) return; setBusy(true); try { await orders.pay(active.id, { provider }); toast.success(provider === 'CASH' ? t("You'll pay cash", 'Utalipa cash') : t('Check your phone to pay', 'Angalia simu kulipa')); setTimeout(loadOrders, 2000); } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); } }
  async function logout() { try { await auth.logout(); } catch {} router.replace('/auth/login'); }

  async function toggleFav(supplierId: string, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    try { const r = await vendors.favorite(supplierId); setVlist((cur) => (cur ?? []).map((x) => x.supplierId === supplierId ? { ...x, favorited: r.favorited } : x)); } catch {}
  }

  // Ad "Shop now": if a nearby shop stocks the brand, surface them so the tap turns
  // into a real order. Returns false (→ SponsoredAds opens the lead form) if none do.
  async function shopAd(ad: any): Promise<boolean> {
    try {
      const r = await vendors.search({ lat: center.lat, lng: center.lng, brand: ad.brand, type: ad.type || undefined, radiusKm: 50 });
      const found = r.vendors ?? [];
      if (found.length === 0) return false;
      setFilter((f) => ({ ...f, brand: ad.brand, type: (ad.type as string) || f.type }));
      setVlist(found);
      toast.success(found.length === 1 ? t(`1 shop near you stocks ${ad.brand}`, `Duka 1 karibu lina ${ad.brand}`) : t(`${found.length} shops near you stock ${ad.brand}`, `Maduka ${found.length} karibu yana ${ad.brand}`));
      setTimeout(() => document.getElementById('vendor-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      return true;
    } catch { return false; }
  }

  const markers = (vlist ?? []).filter((v) => v.lat != null).map((v) => ({ lat: v.lat, lng: v.lng, kind: 'vendor' as const, label: v.businessName, id: v.supplierId, shop: v.businessName }))
    .concat([{ lat: center.lat, lng: center.lng, kind: 'me' as const, label: savedAddr?.label ?? t('You', 'Wewe'), id: '', shop: '' }]);

  const unpaid = active && active.payment?.status !== 'PAID' && active.payment?.provider !== 'CASH';
  function heroLine(): string {
    if (!active) return '';
    if (unpaid) return t('Awaiting your payment', 'Inasubiri malipo yako');
    if (active.status === 'RIDER_ACCEPTED') return t('Confirm the rider fee', 'Thibitisha ada ya dereva');
    if (active.status === 'FEE_CONFIRMED') return t('Rider heading to pickup', 'Dereva anaenda kuchukua');
    if (active.status === 'PICKED') return t('On the way · arriving soon', 'Njiani · inakaribia');
    if (active.status === 'DELIVERED') return t('Delivered — please confirm', 'Imefika — tafadhali thibitisha');
    if (['ACCEPTED', 'RIDER_OFFERED'].includes(active.status)) return t('Matching a rider · 3–5 min', 'Inatafuta dereva · dakika 3–5');
    return t('Sent to vendor', 'Imetumwa kwa muuzaji');
  }

  return (
    <div className="min-h-screen pb-28">
      {/* ── Greeting header ───────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-black/5 bg-sand/85 backdrop-blur dark:border-white/5">
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold leading-tight">{greet}, {firstName}</div>
            <div className="truncate text-xs text-ink/50">{t('Delivering gas to your location', 'Tunaleta gesi kwenye eneo lako')}</div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <Link href="/notifications" className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink/60 shadow-ds-card"><Bell size={18} /></Link>
            <button onClick={() => setMenu((m) => !m)} className="grid h-10 w-10 place-items-center rounded-full bg-grad-brand text-sm font-bold text-white" aria-label={t('Account', 'Akaunti')}>{firstName.slice(0, 1).toUpperCase()}</button>
          </div>
        </div>
        {menu && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
            <div className="absolute right-5 top-[58px] z-40 w-56 rounded-2xl border border-black/5 bg-white p-3 shadow-ds-card">
              <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-ink/50">{t('Language', 'Lugha')}</span><LangToggle /></div>
              <Link href="/addresses" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium hover:bg-black/5"><MapPin size={16} className="text-flame" /> {t('My addresses', 'Anwani zangu')}</Link>
              <Link href="/wallet" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium hover:bg-black/5"><Wallet size={16} className="text-leaf-dark" /> {t('Wallet', 'Pochi')}</Link>
              <Link href="/cylinders" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium hover:bg-black/5"><Flame size={16} className="text-flame" /> {t('My gas cylinders', 'Mitungi yangu')}</Link>
              <button onClick={logout} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-medium text-danger hover:bg-danger/5"><LogOut size={16} /> {t('Sign out', 'Toka')}</button>
            </div>
          </>
        )}
      </header>

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        {/* ── Active order HERO ───────────────────────────────────────────── */}
        {active && (
          <div className="rounded-ds-xl border-2 border-flame/30 bg-white p-4 shadow-ds-card">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('Your order', 'Oda yako')}</div>
                <div className="truncate text-2xl font-extrabold tracking-tight">{active.orderNo}</div>
                <div className="truncate text-sm text-ink/60">{active.supplier?.businessName}</div>
              </div>
              <Badge status={active.status} />
            </div>
            <div className="mt-2.5 flex items-center gap-2 text-sm font-semibold text-flame">
              <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-flame opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-flame" /></span>
              {heroLine()}
            </div>

            <div className="mt-3.5">
              {unpaid ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="primary" loading={busy} onClick={() => payNow('MPESA')}><Smartphone size={15} /> {t('Pay now', 'Lipa sasa')}</Button>
                  <Button variant="ghost" loading={busy} onClick={() => payNow('CASH')}><Banknote size={15} /> {t('Cash', 'Cash')}</Button>
                </div>
              ) : active.status === 'RIDER_ACCEPTED' ? (
                <div className="rounded-xl bg-flame/5 p-3">
                  <div className="flex items-center justify-between"><span className="inline-flex items-center gap-1.5 text-sm font-bold text-flame"><HandCoins size={16} /> {t('Rider fee', 'Ada ya dereva')}</span><Money value={active.deliveryFee} className="text-lg" /></div>
                  <Button variant="primary" loading={busy} onClick={confirmFee} className="mt-2 w-full">{t('Confirm & start', 'Thibitisha & anza')}</Button>
                </div>
              ) : active.status === 'DELIVERED' ? (
                <Link href={`/order/${active.id}`}><Button variant="leaf" className="w-full">{t('Confirm & rate', 'Thibitisha & toa nyota')}</Button></Link>
              ) : (
                <Link href={`/order/${active.id}`}><Button variant="primary" className="w-full"><Navigation size={16} /> {t('Track order', 'Fuatilia oda')}</Button></Link>
              )}
            </div>
          </div>
        )}

        {/* ── Location ────────────────────────────────────────────────────── */}
        <button onClick={useCurrentLocation} disabled={locBusy} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-ds-card">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-flame/10 text-flame"><MapPin size={18} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-ink/40">{t('Deliver to', 'Inaletwa')}</div>
            <div className="truncate text-sm font-semibold">{savedAddr ? [savedAddr.label, savedAddr.ward, savedAddr.district].filter(Boolean).join(' · ') : t('Tap to set your location', 'Bonyeza kuweka eneo')}</div>
          </div>
          <Navigation size={16} className={cn('flex-shrink-0 text-flame', locBusy && 'animate-pulse')} />
        </button>

        {/* mismatch prompt */}
        {mismatchM != null && savedAddr && (
          <div className="rounded-2xl border border-flame/40 bg-flame/5 p-3">
            <div className="text-sm"><span className="font-semibold">{t("You're about", 'Uko takriban')} {prettyDistance(mismatchM)} {t('from', 'kutoka')} {savedAddr.label}.</span> {t('Deliver here instead?', 'Uletewe hapa badala yake?')}</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="primary" loading={locBusy} onClick={useCurrentLocation}><Navigation size={15} /> {t('Deliver here', 'Lete hapa')}</Button>
              <Button variant="ghost" onClick={() => setMismatchM(null)}>{t('Keep saved', 'Baki na hii')}</Button>
            </div>
          </div>
        )}

        {/* ── Search (immediately below location) ─────────────────────────── */}
        <button onClick={search} className="flex w-full items-center gap-2.5 rounded-2xl bg-white px-4 py-3.5 text-left shadow-ds-card active:scale-[.99]">
          <Search size={18} className="flex-shrink-0 text-flame" />
          <span className="flex-1 text-sm text-ink/45">{t('Search gas vendors near you', 'Tafuta wauzaji wa gesi karibu')}</span>
          {searching ? <Loader2 size={16} className="animate-spin text-flame" /> : <span className="text-xs font-bold text-flame">{t('Search', 'Tafuta')}</span>}
        </button>

        {/* ── Quick actions ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { href: '/subscriptions', icon: RefreshCw, label: t('Auto-refill', 'Rejesha'), bg: 'bg-leaf/15', fg: 'text-leaf-dark' },
            { href: '/invite',        icon: Gift,      label: t('Invite', 'Alika'),         bg: 'bg-flame/15', fg: 'text-flame' },
            { href: '/wallet',        icon: Wallet,    label: t('Wallet', 'Pochi'),         bg: 'bg-ember/15', fg: 'text-ember' },
          ].map((a) => {
            const Icon = a.icon;
            return (
              <Link key={a.href} href={a.href} className="flex flex-col items-center gap-1.5 rounded-2xl bg-white py-3.5 shadow-ds-card active:scale-[.97]">
                <span className={cn('grid h-10 w-10 place-items-center rounded-full', a.bg, a.fg)}><Icon size={20} /></span>
                <span className="text-xs font-semibold">{a.label}</span>
              </Link>
            );
          })}
        </div>

        {/* ── Categories (icon chips) ─────────────────────────────────────── */}
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          <button onClick={() => setFilter((f) => ({ ...f, type: '' }))} className={cn('flex-shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition', !filter.type ? 'bg-grad-brand text-white shadow-ds-btn' : 'bg-white text-ink/60 shadow-ds-card')}>{t('All', 'Zote')}</button>
          {CATS.map((c) => {
            const Icon = c.icon; const on = filter.type === c.v;
            return (
              <button key={c.v} onClick={() => setFilter((f) => ({ ...f, type: f.type === c.v ? '' : c.v }))} className={cn('flex flex-shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition', on ? 'bg-grad-brand text-white shadow-ds-btn' : 'bg-white text-ink/60 shadow-ds-card')}><Icon size={15} /> {c.l}</button>
            );
          })}
        </div>

        {/* brand / size — compact, only when a brand/size choice is useful */}
        <div className={cn('grid gap-2', filter.type === 'ACCESSORY' ? 'grid-cols-1' : 'grid-cols-2')}>
          <select value={filter.brand} onChange={(e) => setFilter((f) => ({ ...f, brand: e.target.value }))} className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm font-medium text-ink outline-none focus:border-flame">
            <option value="">{t('All brands', 'Brand zote')}</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          {filter.type !== 'ACCESSORY' && (
            <select value={filter.sizeKg} onChange={(e) => setFilter((f) => ({ ...f, sizeKg: e.target.value }))} className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm font-medium text-ink outline-none focus:border-flame">
              <option value="">{t('All sizes', 'Saizi zote')}</option>
              {sizes.map((s) => <option key={s} value={s}>{s} kg</option>)}
            </select>
          )}
        </div>

        {/* ── Sponsored offers, targeted to the selected region (revenue) ──── */}
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h2 className="flex-shrink-0 text-sm font-bold text-ink/70">{t('Offers near you', 'Ofa karibu nawe')}</h2>
            <div className="flex min-w-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 shadow-ds-card">
              <MapPin size={12} className="flex-shrink-0 text-flame" />
              <select value={adRegion} onChange={(e) => { regionTouched.current = true; setAdRegion(e.target.value); }} className="max-w-[9rem] truncate bg-transparent text-xs font-semibold text-ink outline-none" aria-label={t('Region', 'Mkoa')}>
                {TZ_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <SponsoredAds region={adRegion} userName={user.name} userPhone={user.phone} onShop={shopAd} />
        </div>

        {/* ── Vendors ─────────────────────────────────────────────────────── */}
        {vlist !== null && (
          <div id="vendor-list" className="scroll-mt-20">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold">{vlist.length} {t('vendors nearby', 'wauzaji karibu')}</h2>
              <div className="flex items-center rounded-full bg-black/5 p-0.5 text-xs font-bold">
                <button onClick={() => setView('list')} className={cn('flex items-center gap-1 rounded-full px-2.5 py-1', view === 'list' ? 'bg-flame text-white' : 'text-ink/50')}><List size={13} /> {t('List', 'Orodha')}</button>
                <button onClick={() => setView('map')} className={cn('flex items-center gap-1 rounded-full px-2.5 py-1', view === 'map' ? 'bg-flame text-white' : 'text-ink/50')}><MapIcon size={13} /> {t('Map', 'Ramani')}</button>
              </div>
            </div>
            {vlist.length === 0 ? <EmptyState icon={<Package size={36} />} title={t('No vendor with stock nearby', 'Hakuna muuzaji mwenye stock karibu')} sub={t('Try another brand or size.', 'Jaribu brand au saizi nyingine.')} /> :
              view === 'map' ? (
                <div className="overflow-hidden rounded-ds-xl bg-white p-1.5 shadow-ds-card"><Map markers={markers} height={340} onMarkerClick={(id) => id && router.push(`/vendor/${id}`)} /></div>
              ) : (
                <div className="space-y-2.5">
                  {vlist.map((v) => (
                    <Link key={v.supplierId} href={`/vendor/${v.supplierId}`} className="block rounded-ds-xl bg-white p-3 shadow-ds-card transition active:scale-[.99]">
                      <div className="flex items-center gap-3">
                        <span className="grid h-11 w-11 flex-shrink-0 place-items-center overflow-hidden rounded-xl bg-flame/10 text-flame">{v.logoUrl ? <img src={v.logoUrl} alt="" className="h-full w-full object-cover" /> : <Store size={20} />}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-bold">{v.businessName}</span>
                            {v.isVerified && <BadgeCheck size={15} className="flex-shrink-0 text-leaf" />}
                            {v.featured && <span className="flex-shrink-0 rounded-full bg-ember/15 px-1.5 text-[9px] font-bold uppercase text-ember">{t('Top', 'Bora')}</span>}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-ink/50">
                            <span className="inline-flex items-center gap-0.5 font-semibold text-ink/70"><Star size={12} className="fill-ember text-ember" /> {v.rating ? v.rating.toFixed(1) : t('New', 'Mpya')}</span>
                            <span className="inline-flex items-center gap-0.5"><MapPin size={11} /> {v.distanceKm < 1 ? `${Math.round(v.distanceKm * 1000)} m` : `${v.distanceKm} km`}</span>
                            <span className="inline-flex items-center gap-0.5"><Clock size={11} /> {v.etaMin} {t('min', 'dak')}</span>
                          </div>
                        </div>
                        <button onClick={(e) => toggleFav(v.supplierId, e)} className="grid h-8 w-8 flex-shrink-0 place-items-center" aria-label={t('Favourite', 'Pendwa')}><Heart size={17} className={v.favorited ? 'fill-flame text-flame' : 'text-ink/25'} /></button>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between border-t border-black/5 pt-2.5">
                        <span className="text-sm">{v.fromPrice != null ? <><span className="text-xs text-ink/45">{t('From', 'Kuanzia')} </span><Money value={v.fromPrice} className="text-flame" /></> : <span className="text-xs text-ink/45">{t('Tap to view', 'Bonyeza kuona')}</span>}</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-flame/10 px-3.5 py-1.5 text-xs font-bold text-flame">{t('Order', 'Agiza')} <ChevronRight size={13} /></span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
          </div>
        )}
      </div>

      {/* ── Sticky "Refill now" FAB (fast reorder of your usual) ──────────── */}
      {!active && lastDone && (
        <button onClick={() => reorder(lastDone)} disabled={reordering === lastDone.id} className="fixed bottom-[5.25rem] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-grad-brand px-6 py-3.5 text-sm font-bold text-white shadow-ds-btn active:scale-[.97]">
          {reordering === lastDone.id ? <Loader2 size={18} className="animate-spin" /> : <RotateCcw size={18} />} {t('Refill now', 'Jaza sasa')}
        </button>
      )}

      <RoleNav role="HOUSEHOLD" />
    </div>
  );
}
