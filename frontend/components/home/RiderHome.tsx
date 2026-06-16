'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { Power, Bike, MapPin, Package, Star, CheckCircle2, Navigation, Phone, Camera, Clock, ShieldAlert, BadgeCheck, Wallet, ChevronRight, MessageCircle, Siren } from 'lucide-react';
import { jobs, support, getAccessToken, JikoUser } from '../../lib/api';
import { useSocket } from '../../lib/useSocket';
import { useT } from '../../lib/i18n';
import { localPhone } from '../../lib/utils';
import { primeAudio } from '../../lib/sound';
import { getDeviceLocation } from '../../lib/location';
import { useRiderTracking } from '../../lib/useRiderTracking';
import { AppHeader } from '../AppHeader';
import { RoleNav } from '../RoleNav';
import { Card, Button, Spinner, EmptyState, Money, cn } from '../ui';
import type { MapMarker } from '../Map';

const Map = dynamic(() => import('../Map'), { ssr: false });

export function RiderHome({ user }: { user: JikoUser }) {
  const { t } = useT();
  const router = useRouter();
  const verified = !!user.riderProfile?.isVerified;
  const token = getAccessToken();
  const { emit, on } = useSocket(token);
  const [online, setOnline] = useState(user.riderProfile?.status === 'ONLINE' || user.riderProfile?.status === 'ON_JOB');
  const [ready, setReady]   = useState(false);
  const [active, setActive] = useState<any>(null);
  const [offers, setOffers] = useState<any[]>([]);
  const [photo, setPhoto]   = useState<string | null>(user.profilePicUrl ?? null);
  const [otp, setOtp]       = useState('');
  const [busy, setBusy]     = useState(false);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const onlineRef = useRef(online);
  const activeRef = useRef(active);
  useEffect(() => { onlineRef.current = online; }, [online]);
  useEffect(() => { activeRef.current = active; }, [active]);

  const refresh = useCallback(async () => {
    // Earnings/trips/rating live on the Earnings tab now — the home only needs the
    // live job state, so we don't fetch the earnings summary here.
    const [a, o] = await Promise.all([jobs.active().catch(() => ({ delivery: null })), jobs.offers().catch(() => ({ offers: [] }))]);
    setActive(a?.delivery ?? null); setOffers(o.offers ?? []); setReady(true);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Real-time location: ONLY while online, continuously share the rider's live
  // GPS so vendors see fresh positions and the household can track an active
  // delivery. The watcher tears down the instant the rider goes offline (the
  // delivery is done) — no background battery drain. Native-aware (Capacitor
  // plugin on the app, navigator.geolocation on web). Nothing is "saved".
  useRiderTracking({
    enabled: online,
    onUpdate: (loc) => {
      coordsRef.current = { lat: loc.lat, lng: loc.lng };
      const a = activeRef.current;
      const enroute = a && ['FEE_CONFIRMED', 'PICKED'].includes(a.order?.status);
      emit('rider:location', { lat: loc.lat, lng: loc.lng, deliveryId: enroute ? a.id : undefined });
    },
  });

  useEffect(() => {
    // Sound + toast come from the global NotificationListener; here we just refresh the feed.
    const offs = ['job:offered', 'fee:confirmed', 'order:cancelled'].map((e) => on(e, () => refresh()));
    return () => offs.forEach((o) => o?.());
  }, [on, refresh]);

  async function toggleOnline() {
    primeAudio(); // unlock the alert sound from this user gesture
    try {
      if (online) { await jobs.offline(); emit('rider:status', { status: 'OFFLINE' }); setOnline(false); return; }
      // Going online: get a fresh accurate fix and share it immediately so vendors see you now.
      let c = coordsRef.current;
      try { const d = await getDeviceLocation(); c = { lat: d.lat, lng: d.lng }; coordsRef.current = c; }
      catch { toast.error(t('Turn on location to receive jobs', 'Washa eneo kupokea kazi')); }
      await jobs.online(c?.lat, c?.lng); emit('rider:status', { status: 'ONLINE' });
      if (c) emit('rider:location', { lat: c.lat, lng: c.lng });
      setOnline(true); await refresh();
    } catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); }
  }
  async function accept(orderId: string) { setBusy(true); try { await jobs.acceptOffer(orderId); toast.success(t('Accepted — fee sent to household', 'Umekubali — ada imetumwa kwa kaya')); await refresh(); } catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setBusy(false); } }
  async function decline(orderId: string) { setBusy(true); try { await jobs.declineOffer(orderId); await refresh(); } finally { setBusy(false); } }
  async function pick() { setBusy(true); try { await jobs.pick(active.orderId); await refresh(); } catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setBusy(false); } }
  async function arrived() { try { await jobs.arrived(active.orderId); toast.success(t('Arrival sent ✓', 'Taarifa imetumwa ✓')); } catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } }
  async function deliver() {
    if (otp.length < 3) return toast.error(t('Enter the confirmation code', 'Weka namba ya uthibitisho'));
    setBusy(true);
    try { const r = await jobs.deliver(active.orderId, otp); toast.success(`${t('Well done! You earned', 'Hongera! Umepata')} TZS ${r.earned?.toLocaleString()}`); setOtp(''); await refresh(); }
    catch (e: any) { toast.error(e?.message ?? t('Wrong code', 'Namba si sahihi')); } finally { setBusy(false); }
  }
  async function sos() {
    try { const c = coordsRef.current; await support.sos(c?.lat, c?.lng); toast.success(t('SOS sent — admin alerted 🚨', 'SOS imetumwa 🚨')); }
    catch { toast.error(t('Failed to send SOS', 'Imeshindwa kutuma SOS')); }
  }
  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => { const url = String(reader.result); setPhoto(url); try { await jobs.setProfile({ photoUrl: url }); toast.success(t('Photo updated', 'Picha imewekwa')); } catch { toast.error(t('Failed', 'Imeshindikana')); } };
    reader.readAsDataURL(f);
  }

  if (!ready) return <Spinner />;
  const o = active?.order;
  const status = o?.status;
  const destUrl = active?.order?.address ? `https://www.google.com/maps/dir/?api=1&destination=${active.order.address.lat},${active.order.address.lng}` : '#';
  const destMarkers: MapMarker[] = active?.order?.address ? [{ lat: active.order.address.lat, lng: active.order.address.lng, kind: 'dest', label: t('Destination', 'Unakoenda') }] : [];

  return (
    <div className="min-h-screen pb-24">
      <AppHeader title={t('Rider', 'Dereva')} subtitle={user.name ?? undefined}
        right={<span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', online ? 'bg-leaf/15 text-leaf-dark' : 'bg-black/10 text-ink/50')}>{online ? 'ONLINE' : 'OFFLINE'}</span>} />

      <div className="mx-auto max-w-md space-y-3 px-5 pt-4">
        {/* profile / photo */}
        <Card className="flex items-center gap-3 !p-3">
          {photo ? <img src={photo} alt="" className="h-12 w-12 rounded-full object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-full bg-flame/15 font-bold text-flame">{(user.name ?? '?').slice(0, 2).toUpperCase()}</span>}
          <div className="flex-1 min-w-0"><div className="flex items-center gap-1 font-semibold">{user.name}{verified && <BadgeCheck size={15} className="text-leaf" />}</div><div className="text-xs text-ink/50">{user.riderProfile?.plateNo ?? user.riderProfile?.vehicleType} · {localPhone(user.phone)}</div></div>
          <label className="flex cursor-pointer items-center gap-1 rounded-xl bg-black/5 px-3 py-2 text-xs font-semibold"><Camera size={14} /> {photo ? t('Update', 'Badili') : t('Add photo', 'Weka picha')}<input type="file" accept="image/*" capture="user" onChange={onPhoto} className="hidden" /></label>
        </Card>

        {!verified && (user.kycStatus === 'SUBMITTED' ? (
          <Card className="flex items-center gap-3 border-warning/40 !bg-warning/5">
            <Clock className="text-warning flex-shrink-0" size={22} />
            <div className="flex-1 text-sm"><span className="font-semibold">{t('KYC under review', 'KYC inakaguliwa')}</span> — {t("we'll notify you once approved.", 'tutakuarifu ikikubaliwa.')}</div>
          </Card>
        ) : (
          <Link href="/kyc"><Card className="flex items-center gap-3 border-warning/40 !bg-warning/5">
            <ShieldAlert className="text-warning flex-shrink-0" size={22} />
            <div className="flex-1 text-sm"><span className="font-semibold">{t('Verify your identity (KYC)', 'Thibitisha utambulisho (KYC)')}</span> — {t('to earn your verified badge.', 'kupata beji ya uthibitisho.')}</div>
            <span className="flex-shrink-0 rounded-full bg-warning px-3 py-1 text-xs font-bold text-white">{t('Verify', 'Thibitisha')}</span>
          </Card></Link>
        ))}

        <button onClick={toggleOnline} className={cn('flex w-full items-center justify-center gap-2 rounded-ds-xl py-4 text-base font-bold shadow-ds-btn transition active:scale-[.99]', online ? 'bg-ink/80 text-white' : 'bg-grad-leaf text-white')}>
          <Power size={20} /> {online ? t('Go offline', 'Maliza') : t('Go online', 'Anza kazi')}
        </button>

        <div className="grid grid-cols-2 gap-2.5">
          <Link href="/rider/earnings"><Card className="flex items-center justify-between !p-3.5"><span className="flex items-center gap-2 font-semibold"><Star size={17} className="text-ember" /> {t('Earnings', 'Mapato')}</span><ChevronRight size={18} className="text-ink/30" /></Card></Link>
          <Link href="/wallet"><Card className="flex items-center justify-between !p-3.5"><span className="flex items-center gap-2 font-semibold"><Wallet size={17} className="text-leaf-dark" /> {t('Wallet', 'Pochi')}</span><ChevronRight size={18} className="text-ink/30" /></Card></Link>
        </div>

        {/* ACTIVE JOB */}
        {o ? (
          <Card className="border-flame/30">
            <div className="mb-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-bold text-flame"><Bike size={18} /> {t('Active job', 'Kazi inayoendelea')}</span>
              <span className="text-sm font-semibold">{o.orderNo}</span>
            </div>

            {status === 'RIDER_ACCEPTED' ? (
              <div className="rounded-xl bg-warning/10 p-3 text-sm text-warning flex items-center gap-2"><Clock size={16} /> {t('Waiting for the household to confirm your fee', 'Inasubiri kaya kuthibitisha ada yako')} (<Money value={o.deliveryFee} className="text-xs" />).</div>
            ) : (
              <>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2"><span className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-flame/15 text-flame"><Package size={13} /></span><div><div className="font-semibold">{t('Pick up', 'Chukua')}: {o.supplier?.businessName}</div><div className="text-xs text-ink/50">{localPhone(o.supplier?.phone)}</div></div></div>
                  <div className="flex items-start gap-2"><span className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-leaf/15 text-leaf"><MapPin size={13} /></span><div><div className="font-semibold">{t('Deliver to', 'Peleka')}: {o.address?.label}{o.address?.ward ? ` · ${o.address.ward}` : ''}</div><div className="text-xs text-ink/50">{o.household?.name}</div></div></div>
                </div>
                {destMarkers.length > 0 && <div className="mt-3"><Map markers={destMarkers} height={160} /></div>}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button onClick={() => router.push(`/chat/${o.orderId}`)} className="flex items-center justify-center gap-1.5 rounded-2xl bg-flame/15 py-3 text-sm font-semibold text-flame"><MessageCircle size={15} /> {t('Chat', 'Ongea')}</button>
                  <a href={`tel:${o.household?.phone}`} className="flex items-center justify-center gap-1.5 rounded-2xl bg-black/5 py-3 text-sm font-semibold"><Phone size={15} /> {t('Call', 'Piga')}</a>
                  <a href={destUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-2xl bg-leaf/15 py-3 text-sm font-semibold text-leaf-dark"><Navigation size={15} /> {t('Navigate', 'Ramani')}</a>
                </div>
                <button onClick={sos} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-danger/40 py-2.5 text-sm font-bold text-danger active:bg-danger/5"><Siren size={16} /> {t('Emergency SOS', 'Dharura SOS')}</button>
                <div className="mt-2 flex items-center justify-between border-t border-black/5 pt-2 text-sm"><span className="text-ink/50">{t('Your fee', 'Ada yako')}</span><Money value={o.deliveryFee} className="text-leaf-dark" /></div>
                <div className="mt-3 space-y-2">
                  {status === 'FEE_CONFIRMED' && (
                    <>
                      <button onClick={arrived} className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-flame/40 py-2.5 text-sm font-bold text-flame active:bg-flame/5"><MapPin size={16} /> {t("I've arrived at pickup", 'Nimefika kuchukua')}</button>
                      <Button variant="primary" loading={busy} onClick={pick} className="w-full">{t('Picked up the gas ✓', 'Nimechukua gesi ✓')}</Button>
                    </>
                  )}
                  {status === 'PICKED' && (
                    <div className="space-y-2">
                      <button onClick={arrived} className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-flame/40 py-2.5 text-sm font-bold text-flame active:bg-flame/5"><MapPin size={16} /> {t("I've arrived — notify customer", 'Nimefika — mjulishe mteja')}</button>
                      <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={4} placeholder={t('Confirmation code from household', 'Namba kutoka kwa kaya')} className="w-full min-h-touch rounded-2xl border border-black/15 bg-white px-4 text-center text-lg tracking-[.4em] text-ink outline-none focus:border-flame" />
                      <Button variant="leaf" loading={busy} onClick={deliver} className="w-full"><CheckCircle2 size={18} /> {t('Confirm delivered', 'Thibitisha umefikisha')}</Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </Card>
        ) : !online ? (
          <EmptyState icon={<Power size={36} />} title={t("You're offline", 'Uko offline')} sub={t('Go online so suppliers can send you delivery jobs.', 'Kuwa online ili wauzaji wakutume kazi.')} />
        ) : (
          <div>
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink/70"><Bike size={15} /> {t('Pickup offers', 'Ofa za kazi')}</h2>
            {offers.length === 0 ? <EmptyState icon={<Clock size={34} />} title={t('No offers yet', 'Hakuna ofa bado')} sub={t('A supplier will send you a job. It appears here live.', 'Muuzaji atakutumia kazi. Itaonekana hapa.')} /> :
              <div className="space-y-2.5">
                {offers.map((j) => (
                  <Card key={j.orderId}>
                    <div className="flex items-center justify-between">
                      <div><div className="font-bold">{j.vendor}</div><div className="text-xs text-ink/50">→ {j.drop?.label}{j.tripKm ? ` · ${j.tripKm} km · ~${j.tripEtaMin} ${t('min', 'dak')}` : ''}</div></div>
                      <Money value={j.fee} className="text-leaf-dark" />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button variant="ghost" loading={busy} onClick={() => decline(j.orderId)}>{t('Decline', 'Kataa')}</Button>
                      <Button variant="primary" loading={busy} onClick={() => accept(j.orderId)}>{t('Accept', 'Kubali')}</Button>
                    </div>
                  </Card>
                ))}
              </div>
            }
          </div>
        )}
      </div>
      <RoleNav role="RIDER" />
    </div>
  );
}
