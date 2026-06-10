'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { Power, Bike, MapPin, Package, Wallet, Star, CheckCircle2, Navigation } from 'lucide-react';
import { jobs, getAccessToken, JikoUser } from '../../lib/api';
import { useSocket } from '../../lib/useSocket';
import { AppHeader } from '../AppHeader';
import { RoleNav } from '../RoleNav';
import { Card, Button, Spinner, EmptyState, Money, Stat, cn } from '../ui';

export function RiderHome({ user }: { user: JikoUser }) {
  const token = getAccessToken();
  const { emit, on } = useSocket(token);
  const [online, setOnline]     = useState(user.riderProfile?.status === 'ONLINE' || user.riderProfile?.status === 'ON_JOB');
  const [earn, setEarn]         = useState<any>(null);
  const [active, setActive]     = useState<any>(null);
  const [feed, setFeed]         = useState<any[]>([]);
  const [otp, setOtp]           = useState('');
  const [busy, setBusy]         = useState(false);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);

  const refresh = useCallback(async () => {
    const [e, a] = await Promise.all([jobs.earnings().catch(() => null), jobs.active().catch(() => ({ delivery: null }))]);
    setEarn(e); setActive(a?.delivery ?? null);
    if (!a?.delivery) {
      const c = coordsRef.current;
      const f = await jobs.available(c?.lat, c?.lng).catch(() => ({ jobs: [] }));
      setFeed(f.jobs ?? []);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Track GPS; feed it to live tracking while on a job.
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        coordsRef.current = { lat: p.coords.latitude, lng: p.coords.longitude };
        if (online && active) emit('rider:location', { lat: p.coords.latitude, lng: p.coords.longitude, deliveryId: active.id });
      },
      () => {}, { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [online, active, emit]);

  // Live job feed.
  useEffect(() => {
    const offNew   = on('job:new',   (j: any) => setFeed((f) => f.find((x) => x.orderId === j.orderId) ? f : [{ ...j, deliveryId: j.deliveryId }, ...f]));
    const offTaken = on('job:taken', (j: any) => setFeed((f) => f.filter((x) => x.orderId !== j.orderId)));
    return () => { offNew?.(); offTaken?.(); };
  }, [on]);

  async function toggleOnline() {
    try {
      if (online) { await jobs.offline(); emit('rider:status', { status: 'OFFLINE' }); setOnline(false); setFeed([]); }
      else {
        const c = coordsRef.current;
        await jobs.online(c?.lat, c?.lng); emit('rider:status', { status: 'ONLINE' }); setOnline(true);
        await refresh();
      }
    } catch { toast.error('Imeshindikana'); }
  }

  async function claim(orderId: string) {
    setBusy(true);
    try { await jobs.claim(orderId); toast.success('Umechukua kazi!'); setFeed([]); await refresh(); }
    catch (e: any) { toast.error(e?.message ?? 'Kazi imeshachukuliwa'); setFeed((f) => f.filter((x) => x.orderId !== orderId)); }
    finally { setBusy(false); }
  }
  async function pick() { setBusy(true); try { await jobs.pick(active.orderId); await refresh(); } finally { setBusy(false); } }
  async function deliver() {
    if (otp.length < 3) return toast.error('Weka namba ya uthibitisho');
    setBusy(true);
    try { const r = await jobs.deliver(active.orderId, otp); toast.success(`Hongera! Umepata TZS ${r.earned?.toLocaleString()}`); setOtp(''); await refresh(); }
    catch (e: any) { toast.error(e?.message ?? 'Namba si sahihi'); }
    finally { setBusy(false); }
  }

  if (!earn) return <Spinner />;
  const o = active?.order;

  return (
    <div className="min-h-screen pb-24">
      <AppHeader
        title="Dereva"
        subtitle={user.name ?? undefined}
        right={<span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', online ? 'bg-leaf/15 text-leaf-dark' : 'bg-black/10 text-ink/50')}>{online ? 'ONLINE' : 'OFFLINE'}</span>}
      />

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        {/* online toggle */}
        <button onClick={toggleOnline} className={cn('flex w-full items-center justify-center gap-2 rounded-ds-xl py-4 text-base font-bold shadow-ds-btn transition active:scale-[.99]', online ? 'bg-black/80 text-white' : 'bg-grad-leaf text-white')}>
          <Power size={20} /> {online ? 'Maliza kazi (Offline)' : 'Anza kupokea kazi (Online)'}
        </button>

        {/* earnings */}
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Mapato" value={<Money value={earn.totalEarnings} className="text-base" />} accent />
          <Stat label="Safari" value={earn.totalDeliveries} />
          <Stat label="Nyota" value={<span className="inline-flex items-center gap-1"><Star size={16} className="fill-ember text-ember" />{earn.rating ? earn.rating.toFixed(1) : '—'}</span>} />
        </div>

        {/* active job */}
        {o ? (
          <Card className="border-flame/30">
            <div className="mb-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-bold text-flame"><Bike size={18} /> Kazi inayoendelea</span>
              <span className="text-sm font-semibold">{o.orderNo}</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2"><span className="mt-0.5 grid h-6 w-6 place-items-center rounded-full bg-flame/15 text-flame"><Package size={13} /></span><div><div className="font-semibold">Chukua: {o.supplier?.businessName}</div><div className="text-xs text-ink/50">{o.supplier?.phone}</div></div></div>
              <div className="flex items-start gap-2"><span className="mt-0.5 grid h-6 w-6 place-items-center rounded-full bg-leaf/15 text-leaf"><MapPin size={13} /></span><div><div className="font-semibold">Peleka: {o.address?.label}</div><div className="text-xs text-ink/50">{o.household?.name} · {o.household?.phone}</div></div></div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-3">
              <span className="text-xs text-ink/50">Malipo yako</span><Money value={o.deliveryFee} className="text-leaf-dark" />
            </div>

            <div className="mt-4">
              {active.status === 'CLAIMED' && <Button variant="primary" loading={busy} onClick={pick} className="w-full">Nimechukua gesi ✓</Button>}
              {active.status === 'PICKED' && (
                <div className="space-y-2">
                  <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={4} placeholder="Namba ya uthibitisho (OTP)" className="w-full min-h-touch rounded-2xl border border-black/10 bg-white px-4 text-center text-lg tracking-[.4em] outline-none focus:border-flame" />
                  <Button variant="leaf" loading={busy} onClick={deliver} className="w-full"><CheckCircle2 size={18} /> Thibitisha umefikisha</Button>
                </div>
              )}
            </div>
          </Card>
        ) : !online ? (
          <EmptyState icon={<Power size={36} />} title="Uko offline" sub="Bonyeza kitufe hapo juu uanze kupokea kazi za kusambaza gesi." />
        ) : (
          <div>
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink/70"><Navigation size={15} /> Kazi zinazopatikana</h2>
            {feed.length === 0 ? <EmptyState icon={<Bike size={36} />} title="Hakuna kazi kwa sasa" sub="Subiri — oda mpya zitaonekana hapa moja kwa moja." /> :
              <div className="space-y-2.5">
                {feed.map((j) => (
                  <Card key={j.orderId}>
                    <div className="flex items-center justify-between">
                      <div><div className="font-bold">{j.vendor}</div><div className="text-xs text-ink/50">{j.tripKm ? `${j.tripKm} km · ~${j.tripEtaMin} dak` : 'Dar es Salaam'}</div></div>
                      <Money value={j.payout} className="text-leaf-dark" />
                    </div>
                    <Button variant="primary" loading={busy} onClick={() => claim(j.orderId)} className="mt-3 w-full">Chukua kazi</Button>
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
