'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { MapPin, Star, BadgeCheck, Search, Navigation, Package } from 'lucide-react';
import { vendors, orders, addresses, JikoUser } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { AppHeader } from '../AppHeader';
import { RoleNav } from '../RoleNav';
import { Card, Pill, Spinner, EmptyState, Money, Badge } from '../ui';

const DAR = { lat: -6.7924, lng: 39.2083 };

export function HouseholdHome({ user }: { user: JikoUser }) {
  const { t } = useT();
  const [coords, setCoords]   = useState(DAR);
  const [brands, setBrands]   = useState<string[]>([]);
  const [sizes, setSizes]     = useState<number[]>([]);
  const [filter, setFilter]   = useState<{ type?: string; brand?: string; sizeKg?: number }>({ type: 'REFILL' });
  const [vlist, setVlist]     = useState<any[] | null>(null);
  const [addrs, setAddrs]     = useState<any[]>([]);
  const [recent, setRecent]   = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const TYPES = [
    { v: 'REFILL', l: t('Refill', 'Refill') },
    { v: 'CYLINDER', l: t('New cylinder', 'Mtungi mpya') },
    { v: 'ACCESSORY', l: t('Accessories', 'Vifaa') },
  ];
  const defaultAddr = addrs.find((a) => a.isDefault) ?? addrs[0];

  useEffect(() => {
    vendors.products().then((r) => { setBrands(r.brands ?? []); setSizes(r.sizes ?? []); }).catch(() => {});
    addresses.list().then((r) => setAddrs(r.addresses ?? [])).catch(() => {});
    orders.list().then((r) => setRecent((r.orders ?? []).slice(0, 3))).catch(() => {});
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => {}, { timeout: 6000 },
      );
    }
  }, []);

  const search = useCallback(async () => {
    setSearching(true);
    try { const r = await vendors.search({ ...coords, ...filter, radiusKm: 20 }); setVlist(r.vendors ?? []); }
    catch { setVlist([]); } finally { setSearching(false); }
  }, [coords, filter]);

  useEffect(() => { search(); }, [search]);

  async function useMyLocation() {
    if (!navigator.geolocation) return toast.error(t('GPS unavailable', 'GPS haipatikani'));
    navigator.geolocation.getCurrentPosition(async (p) => {
      const lat = p.coords.latitude, lng = p.coords.longitude;
      setCoords({ lat, lng });
      if (!defaultAddr) {
        try {
          await addresses.create({ label: t('Home', 'Nyumbani'), lat, lng, region: user.region ?? 'Dar es Salaam', isDefault: true });
          const r = await addresses.list(); setAddrs(r.addresses ?? []);
          toast.success(t('Address saved', 'Anwani imehifadhiwa'));
        } catch {}
      }
    }, () => toast.error(t("Couldn't get location", 'Imeshindwa kupata eneo')));
  }

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

        {/* filters — wrap so nothing overlaps */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {TYPES.map((ty) => <Pill key={ty.v} active={filter.type === ty.v} onClick={() => setFilter((f) => ({ ...f, type: ty.v }))}>{ty.l}</Pill>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill active={!filter.brand} onClick={() => setFilter((f) => ({ ...f, brand: undefined }))}>{t('All brands', 'Brand zote')}</Pill>
            {brands.map((b) => <Pill key={b} active={filter.brand === b} onClick={() => setFilter((f) => ({ ...f, brand: b }))}>{b}</Pill>)}
          </div>
          {filter.type !== 'ACCESSORY' && (
            <div className="flex flex-wrap gap-2">
              <Pill active={!filter.sizeKg} onClick={() => setFilter((f) => ({ ...f, sizeKg: undefined }))}>{t('All sizes', 'Saizi zote')}</Pill>
              {sizes.map((s) => <Pill key={s} active={filter.sizeKg === s} onClick={() => setFilter((f) => ({ ...f, sizeKg: s }))}>{s}kg</Pill>)}
            </div>
          )}
        </div>

        {/* recent orders */}
        {recent.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink/70">{t('Your recent orders', 'Oda zako za hivi karibuni')}</h2>
              <Link href="/orders" className="text-xs font-semibold text-flame">{t('All', 'Zote')}</Link>
            </div>
            <div className="space-y-2">
              {recent.map((o) => (
                <Link key={o.id} href={`/order/${o.id}`}>
                  <Card className="flex items-center justify-between !p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{o.orderNo}</div>
                      <div className="truncate text-xs text-ink/50">{o.supplier?.businessName}</div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <Money value={o.total} className="text-sm" />
                      <div className="mt-1"><Badge status={o.status} /></div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* vendors */}
        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink/70"><Search size={15} /> {t('Vendors near you', 'Wauzaji walio karibu')}</h2>
          {searching && vlist === null ? <Spinner /> :
            !vlist || vlist.length === 0 ? <EmptyState icon={<Package size={36} />} title={t('No vendor with stock nearby', 'Hakuna muuzaji mwenye stock karibu')} sub={t('Try another brand or size, or widen the area.', 'Jaribu brand au saizi nyingine, au panua eneo.')} /> :
            <div className="space-y-3">
              {vlist.map((v) => (
                <Link key={v.supplierId} href={`/vendor/${v.supplierId}`}>
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-bold">{v.businessName}</span>
                          {v.isVerified && <BadgeCheck size={15} className="flex-shrink-0 text-leaf" />}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink/50">
                          <span className="inline-flex items-center gap-0.5"><Star size={12} className="fill-ember text-ember" /> {v.rating ? v.rating.toFixed(1) : t('New', 'Mpya')}</span>
                          <span>·</span><span>{v.distanceKm} km</span>
                          <span>·</span><span>~{v.etaMin} {t('min', 'dak')}</span>
                        </div>
                      </div>
                      {v.featured && <span className="flex-shrink-0 rounded-full bg-ember/15 px-2 py-0.5 text-[10px] font-bold text-ember">{t('FEATURED', 'FEATURED')}</span>}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-3">
                      <span className="text-xs text-ink/50">{t('From', 'Kuanzia')}</span>
                      <Money value={v.fromPrice ?? 0} className="text-flame" />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          }
        </div>
      </div>
      <RoleNav role="HOUSEHOLD" />
    </div>
  );
}
