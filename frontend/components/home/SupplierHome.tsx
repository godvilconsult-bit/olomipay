'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Store, Bell, AlertTriangle, Check, X, MapPin, Bike, Smartphone, Banknote, Clock, ShieldAlert, Navigation, Wallet, ChevronRight } from 'lucide-react';
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
    const [m, o] = await Promise.all([suppliers.me().catch(() => null), suppliers.orders().catch(() => ({ orders: [] }))]);
    setMe(m); setList(o.orders ?? []);
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

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
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

        {/* plan / featured slot (Phase 2 monetization) */}
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
          <div className="mt-2 border-t border-black/5 pt-2 text-xs text-ink/50">
            {p.tier === 'FREE'
              ? t('Pro lowers your commission + lifts you up the search. Premium adds a featured top slot.', 'Pro hupunguza kamisheni + kukupandisha juu. Premium huongeza nafasi ya kwanza.')
              : t('Thanks for being a paid partner. Contact admin to change your plan.', 'Asante kwa kuwa mshirika. Wasiliana na admin kubadili mpango.')}
          </div>
        </Card>

        <Link href="/wallet"><Card className="flex items-center justify-between !p-3.5"><span className="flex items-center gap-2 font-semibold"><Wallet size={17} className="text-leaf-dark" /> {t('Wallet & cash-out', 'Pochi & toa pesa')}</span><ChevronRight size={18} className="text-ink/30" /></Card></Link>

        {me.stats.lowStock > 0 && (
          <Card className="flex items-center gap-3 border-warning/30 !bg-warning/5">
            <AlertTriangle className="text-warning flex-shrink-0" size={20} />
            <div className="flex-1 text-sm"><span className="font-semibold">{me.stats.lowStock} {t('items', 'bidhaa')}</span> {t('low on stock.', 'zina stock ndogo.')}</div>
          </Card>
        )}

        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink/70"><Bell size={15} /> {t('Orders needing action', 'Oda zinazohitaji hatua')}</h2>
          {queue.length === 0 ? <EmptyState icon={<Store size={36} />} title={t('No orders right now', 'Hakuna oda kwa sasa')} sub={t('New orders appear here the instant they arrive.', 'Oda mpya zitaonekana papo hapo.')} /> :
            <ListGroup>
              {queue.map((o) => {
                const pay = payInfo(o);
                const PayIcon = pay.icon;
                return (
                  <div key={o.id} className={cn('p-3.5', ['ALERTED', 'PLACED'].includes(o.status) && 'bg-flame/5')}>
                    <div className="flex items-start justify-between">
                      <div className="min-w-0"><div className="font-bold">{o.orderNo}</div><div className="truncate text-xs text-ink/50">{o.household?.name} · {localPhone(o.household?.phone)}</div></div>
                      <Badge status={o.status} />
                    </div>
                    <div className="mt-2 space-y-1 text-sm">
                      {o.items?.map((it: any) => <div key={it.id} className="flex justify-between gap-2"><span className="min-w-0 truncate text-ink/70">{it.qty}× {it.brand} {it.productName}</span><Money value={it.lineTotal} className="flex-shrink-0 text-xs" /></div>)}
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-xs text-ink/50"><MapPin size={12} className="flex-shrink-0" /> {o.address?.label}{o.address?.ward ? ` · ${o.address.ward}` : ''}</div>
                    <div className={cn('mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', pay.ok ? 'bg-leaf/15 text-leaf-dark' : 'bg-warning/15 text-warning')}><PayIcon size={13} /> {pay.label}</div>

                    {/* state-aware action */}
                    <div className="mt-3 border-t border-black/5 pt-3">
                      {['ALERTED', 'PLACED'].includes(o.status) ? (
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-ink/50">{t('Total', 'Jumla')} <Money value={o.total} className="ml-1 text-ink" /></div>
                          <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => reject(o.id)} loading={busy === o.id} className="!px-3"><X size={16} /></Button>
                            <Button variant="primary" onClick={() => confirm(o.id)} loading={busy === o.id} disabled={!pay.ok}><Check size={16} /> {t('Confirm', 'Thibitisha')}</Button>
                          </div>
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
      </div>
      <RoleNav role="SUPPLIER" />
    </div>
  );
}
