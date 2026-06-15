'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Store, Bell, AlertTriangle, Check, X, MapPin, Bike, Smartphone, Banknote, Clock, ShieldAlert, Navigation, Wallet, ChevronRight, TrendingUp } from 'lucide-react';
import { suppliers, getAccessToken, JikoUser } from '../../lib/api';
import { useSocket } from '../../lib/useSocket';
import { useT } from '../../lib/i18n';
import { localPhone } from '../../lib/utils';
import { getDeviceLocation, distanceM, prettyDistance } from '../../lib/location';
import { reverseGeocode } from '../../lib/geocode';
import { AppHeader } from '../AppHeader';
import { RoleNav } from '../RoleNav';
import { Card, Button, Spinner, EmptyState, Money, Stat, Badge, ListGroup, cn } from '../ui';

const ACTIVE = ['ALERTED', 'PLACED', 'ACCEPTED', 'RIDER_OFFERED', 'RIDER_ACCEPTED', 'FEE_CONFIRMED', 'PICKED'];

export function SupplierHome({ user }: { user: JikoUser }) {
  const { t } = useT();
  const router = useRouter();
  const { on } = useSocket(getAccessToken());
  const [me, setMe]   = useState<any>(null);
  const [list, setList] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mismatchM, setMismatchM] = useState<number | null>(null);
  const [noLoc, setNoLoc] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [upBusy, setUpBusy] = useState(false);

  async function upgrade(tier: 'STANDARD' | 'PREMIUM') {
    setUpBusy(true);
    try { await suppliers.upgradeRequest(tier); toast.success(t('Upgrade requested — admin will contact you', 'Ombi limetumwa — admin atawasiliana nawe')); }
    catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setUpBusy(false); }
  }

  const refresh = useCallback(async () => {
    const [m, o, a] = await Promise.all([suppliers.me().catch(() => null), suppliers.orders().catch(() => ({ orders: [] })), suppliers.analytics().catch(() => null)]);
    setMe(m); setList(o.orders ?? []); setAnalytics(a);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Compare the shop's saved location to where the device is now.
  useEffect(() => {
    const p = me?.profile;
    if (!p) return;
    if (p.lat == null || p.lng == null) { setNoLoc(true); return; }
    let alive = true;
    getDeviceLocation().then((d) => { if (alive) { const m = distanceM(d, { lat: p.lat, lng: p.lng }); setMismatchM(m > 300 ? m : null); } }).catch(() => {});
    return () => { alive = false; };
  }, [me?.profile?.id]);

  async function updateShopLocation() {
    setLocBusy(true);
    try {
      const d = await getDeviceLocation();
      const g = await reverseGeocode(d.lat, d.lng);
      await suppliers.update({ lat: d.lat, lng: d.lng, ...(g?.region && { region: g.region }), ...(g?.district && { district: g.district }), ...(g?.ward && { ward: g.ward }) });
      setMismatchM(null); setNoLoc(false); await refresh();
      toast.success(t('Shop location updated', 'Eneo la duka limesasishwa'));
    } catch { toast.error(t("Couldn't get your location", 'Imeshindwa kupata eneo')); } finally { setLocBusy(false); }
  }

  useEffect(() => {
    const evs = ['order:new', 'order:rider-accepted', 'rider:declined', 'order:tracking', 'order:picked', 'order:delivered', 'payment:paid'];
    const offs = evs.map((e) => on(e, (d: any) => { if (e === 'order:new') toast(`🔔 ${t('New order', 'Oda mpya')} ${d?.orderNo ?? ''}`, { icon: '🔥' }); refresh(); }));
    return () => offs.forEach((o) => o?.());
  }, [on, refresh, t]);

  async function setHours(openHour: number | null, closeHour: number | null) {
    setMe((m: any) => ({ ...m, profile: { ...m.profile, openHour, closeHour } }));
    try { await suppliers.update({ openHour, closeHour }); toast.success(t('Hours updated', 'Saa zimewekwa')); } catch { refresh(); }
  }
  async function toggleOpen() {
    const next = !me.profile.isOpen;
    setMe((m: any) => ({ ...m, profile: { ...m.profile, isOpen: next } }));
    try { await suppliers.update({ isOpen: next }); } catch { refresh(); }
  }
  async function confirm(id: string) {
    setBusy(id);
    try { await suppliers.accept(id); toast.success(t('Order confirmed', 'Oda imethibitishwa')); await refresh(); }
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

  function payInfo(o: any) {
    if (o.payment?.status === 'PAID') return { ok: true, label: `${t('Paid', 'Imelipwa')} ✓`, icon: Smartphone };
    if (o.payment?.provider === 'CASH') return { ok: true, label: t('Cash on delivery', 'Cash ukipokea'), icon: Banknote };
    return { ok: false, label: t('Awaiting payment', 'Inasubiri malipo'), icon: Clock };
  }

  return (
    <div className="min-h-screen pb-24">
      <AppHeader title={p.businessName} subtitle={t('Supplier dashboard', 'Dashibodi ya muuzaji')}
        right={<button onClick={toggleOpen} className={cn('rounded-full px-3 py-1.5 text-xs font-bold', p.isOpen ? 'bg-leaf/15 text-leaf-dark' : 'bg-black/10 text-ink/50')}>{p.isOpen ? t('OPEN', 'WAZI') : t('CLOSED', 'IMEFUNGWA')}</button>} />

      <div className="mx-auto max-w-md space-y-3 px-5 pt-4">
        {!user.supplierProfile?.isVerified && (user.kycStatus === 'SUBMITTED' ? (
          <Card className="flex items-center gap-3 border-warning/40 !bg-warning/5">
            <Clock className="text-warning flex-shrink-0" size={22} />
            <div className="flex-1 text-sm"><span className="font-semibold">{t('KYC under review', 'KYC inakaguliwa')}</span> — {t("we'll notify you once approved.", 'tutakuarifu ikikubaliwa.')}</div>
          </Card>
        ) : (
          <Link href="/kyc"><Card className="flex items-center gap-3 border-warning/40 !bg-warning/5">
            <ShieldAlert className="text-warning flex-shrink-0" size={22} />
            <div className="flex-1 text-sm"><span className="font-semibold">{t('Verify your business (KYC)', 'Thibitisha biashara (KYC)')}</span> — {t('to earn your verified badge.', 'kupata beji ya uthibitisho.')}</div>
            <span className="flex-shrink-0 rounded-full bg-warning px-3 py-1 text-xs font-bold text-white">{t('Verify', 'Thibitisha')}</span>
          </Card></Link>
        ))}

        {/* shop location — set it or update when the device is elsewhere */}
        {noLoc ? (
          <Card className="border-flame/40 !bg-flame/5">
            <div className="flex items-center gap-2 text-sm"><MapPin size={18} className="flex-shrink-0 text-flame" /><span className="flex-1 font-semibold">{t('Set your shop location so customers can find you.', 'Weka eneo la duka ili wateja wakuone.')}</span></div>
            <Button variant="primary" className="mt-2 w-full" loading={locBusy} onClick={updateShopLocation}><Navigation size={15} /> {t('Set location with GPS', 'Weka eneo kwa GPS')}</Button>
          </Card>
        ) : mismatchM != null ? (
          <Card className="border-flame/40 !bg-flame/5">
            <div className="text-sm">{t('Your shop is saved about', 'Duka lako limehifadhiwa takriban')} {prettyDistance(mismatchM)} {t('from where you are now. Update it?', 'kutoka ulipo sasa. Usasishe?')}</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="primary" loading={locBusy} onClick={updateShopLocation}><Navigation size={15} /> {t('Update', 'Sasisha')}</Button>
              <Button variant="ghost" onClick={() => setMismatchM(null)}>{t('Keep saved', 'Baki na hii')}</Button>
            </div>
          </Card>
        ) : null}

        <div className="grid grid-cols-3 gap-2.5">
          <Stat label={t('Pending', 'Zinasubiri')} value={me.stats.pending} accent />
          <Stat label={t('Today', 'Leo')} value={me.stats.today} />
          <Stat label={t('Low stock', 'Stock ndogo')} value={me.stats.lowStock} />
        </div>

        {me.stats.lowStock > 0 && (
          <Card className="flex items-center gap-3 border-warning/30 !bg-warning/5">
            <AlertTriangle className="text-warning flex-shrink-0" size={20} />
            <div className="flex-1 text-sm"><span className="font-semibold">{me.stats.lowStock} {t('items', 'bidhaa')}</span> {t('low on stock.', 'zina stock ndogo.')}</div>
          </Card>
        )}

        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold"><Bell size={15} className="text-flame" /> {t('Orders needing action', 'Oda zinazohitaji hatua')}{queue.length > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-flame px-1 text-[11px] font-bold text-white">{queue.length}</span>}</h2>
          {queue.length === 0 ? <EmptyState icon={<Store size={36} />} title={t('No orders right now', 'Hakuna oda kwa sasa')} sub={t('New orders appear here the instant they arrive.', 'Oda mpya zitaonekana papo hapo.')} /> :
            <ListGroup>
              {queue.map((o) => {
                const pay = payInfo(o);
                return (
                  <div key={o.id} className={cn('p-3', ['ALERTED', 'PLACED'].includes(o.status) && 'bg-flame/5')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{o.orderNo}</span>
                      <div className="flex flex-shrink-0 items-center gap-1.5"><Money value={o.total} className="text-xs text-ink/60" /><Badge status={o.status} /></div>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink/50">
                      <span className="truncate">{o.household?.name} · {o.items?.[0] ? `${o.items[0].qty}× ${o.items[0].brand} ${o.items[0].productName}` : ''}{o.items?.length > 1 ? ` +${o.items.length - 1}` : ''}</span>
                      <span className={cn('ml-auto flex-shrink-0 font-medium', pay.ok ? 'text-leaf-dark' : 'text-warning')}>{pay.ok ? (o.payment?.provider === 'CASH' ? 'COD' : t('Paid', 'Imelipwa')) : t('Unpaid', 'Haijalipwa')}</span>
                    </div>
                    <div className="mt-2.5">
                      {['ALERTED', 'PLACED'].includes(o.status) ? (
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" onClick={() => reject(o.id)} loading={busy === o.id} className="!px-3"><X size={16} /></Button>
                          <Button variant="primary" onClick={() => confirm(o.id)} loading={busy === o.id} disabled={!pay.ok}><Check size={16} /> {t('Confirm', 'Thibitisha')}</Button>
                        </div>
                      ) : o.status === 'ACCEPTED' ? (
                        <Button variant="primary" className="w-full" onClick={() => router.push(`/supplier/dispatch/${o.id}`)}><Bike size={16} /> {t('Find a rider', 'Tafuta dereva')}</Button>
                      ) : o.status === 'RIDER_OFFERED' ? (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-ink/60">{t('Offered to', 'Imetolewa kwa')} {o.delivery?.rider?.name ?? t('rider', 'dereva')} — {t('waiting', 'inasubiri')}…</span>
                          <button onClick={() => router.push(`/supplier/dispatch/${o.id}`)} className="text-xs font-semibold text-flame">{t('Change', 'Badilisha')}</button>
                        </div>
                      ) : o.status === 'RIDER_ACCEPTED' ? (
                        <span className="text-xs font-medium text-ink/60">{t('Rider accepted — waiting for household to confirm fee', 'Dereva amekubali — inasubiri kaya kuthibitisha ada')}</span>
                      ) : (
                        <Button variant="ghost" className="w-full" onClick={() => router.push(`/supplier/dispatch/${o.id}`)}><MapPin size={16} /> {o.status === 'PICKED' ? t('Track delivery', 'Fuatilia') : t('On the way — track', 'Njiani — fuatilia')}</Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </ListGroup>
          }
        </div>

        {/* ── Business (secondary — below the primary order queue) ───────────── */}
        <h2 className="pt-1 text-sm font-bold text-ink/70">{t('Business', 'Biashara')}</h2>

        {analytics && (
          <Card className="!p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink/60"><TrendingUp size={14} className="text-leaf" /> {t('Sales', 'Mauzo')}</div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div><Money value={analytics.today.sales} className="text-sm" /><div className="text-[10px] text-ink/50">{t('Today', 'Leo')} · {analytics.today.orders} {t('orders', 'oda')}</div></div>
              <div><Money value={analytics.week.sales} className="text-sm" /><div className="text-[10px] text-ink/50">{t('This week', 'Wiki hii')} · {analytics.week.orders} {t('orders', 'oda')}</div></div>
            </div>
            {analytics.topProducts?.length > 0 && <div className="mt-2 border-t border-black/5 pt-2 text-xs text-ink/50">{t('Top', 'Bora')}: {analytics.topProducts.slice(0, 3).map((p: any) => `${p.name} (${p.qty})`).join(', ')}</div>}
          </Card>
        )}

        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-ink/50">{t('Your plan', 'Mpango wako')}</div>
              <div className="flex items-center gap-2 font-bold">
                {p.tier === 'PREMIUM' ? '⭐ Premium' : p.tier === 'STANDARD' ? 'Pro' : t('Free', 'Bure')}
                {p.featured && <span className="rounded-full bg-ember/15 px-2 py-0.5 text-[10px] font-bold text-ember">{t('FEATURED', 'FEATURED')}</span>}
              </div>
            </div>
            {p.tier !== 'PREMIUM' && (
              <Button variant="primary" loading={upBusy} onClick={() => upgrade(p.tier === 'FREE' ? 'STANDARD' : 'PREMIUM')} className="flex-shrink-0 !px-3.5">
                {p.tier === 'FREE' ? t('Go Pro', 'Pata Pro') : t('Go Premium', 'Pata Premium')}
              </Button>
            )}
          </div>
          {p.tier === 'FREE' && <div className="mt-2 border-t border-black/5 pt-2 text-xs text-ink/50">{t('Pro lowers commission + lifts you up search. Premium = featured slot.', 'Pro hupunguza kamisheni + kukupandisha. Premium = nafasi ya juu.')}</div>}
        </Card>

        <Link href="/wallet"><Card className="flex items-center justify-between !p-3.5"><span className="flex items-center gap-2 font-semibold"><Wallet size={17} className="text-leaf-dark" /> {t('Wallet & cash-out', 'Pochi & toa pesa')}</span><ChevronRight size={18} className="text-ink/30" /></Card></Link>

        <Card className="!p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold"><Clock size={15} className="text-flame" /> {t('Open hours', 'Saa za kazi')}</span>
            <div className="flex items-center gap-1.5 text-sm">
              <select value={p.openHour ?? ''} onChange={(e) => setHours(e.target.value === '' ? null : Number(e.target.value), p.closeHour ?? null)} className="rounded-lg border border-black/15 bg-white px-2 py-1 text-ink outline-none focus:border-flame">
                <option value="">{t('Always', 'Saa zote')}</option>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
              <span className="text-ink/40">–</span>
              <select value={p.closeHour ?? ''} onChange={(e) => setHours(p.openHour ?? null, e.target.value === '' ? null : Number(e.target.value))} className="rounded-lg border border-black/15 bg-white px-2 py-1 text-ink outline-none focus:border-flame">
                <option value="">{t('Always', 'Saa zote')}</option>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
            </div>
          </div>
        </Card>
      </div>
      <RoleNav role="SUPPLIER" />
    </div>
  );
}
