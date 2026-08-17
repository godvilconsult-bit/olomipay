'use client';

/**
 * The load board — both directions in one place.
 *
 *   Find loads : a carrier browses cargo, and can post a lane they already run
 *                to be matched to loads along the way (backhaul).
 *   My loads   : a shipper posts cargo and accepts a quote.
 *
 * Which tab opens first depends on the account: a carrier organization wants
 * loads, everyone else wants their own shipments.
 */
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import {
  Truck, Package, Route as RouteIcon, Plus, MapPin, Weight,
  BadgeCheck, Clock, ArrowRight,
} from 'lucide-react';
import {
  freight, ApiError,
  type Load, type FreightQuote, type CarrierLane,
} from '../../lib/api';
import { formatMinor } from '../../lib/money';
import { Button, Card, Field, Spinner, EmptyState, Pill, cn } from '../../components/ui';
import AppShell from '../../components/AppShell';
import { useT } from '../../lib/i18n';

// Leaflet touches window at import time, so the map must not be server-rendered.
const Map = dynamic(() => import('../../components/Map'), { ssr: false });

type Tab = 'near' | 'board' | 'mine' | 'lanes';

const km = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)} km`;
const day = (iso: string) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });

export default function FreightPage() {
  const { t } = useT();
  // Opens on the map: a driver's first question is "what can I pick up from
  // here", not "show me every load in the country".
  const [tab, setTab]     = useState<Tab>('near');
  const [board, setBoard] = useState<Load[]>([]);
  const [mine, setMine]   = useState<Load[]>([]);
  const [lanes, setLanes] = useState<CarrierLane[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLoadForm, setShowLoadForm] = useState(false);
  const [showLaneForm, setShowLaneForm] = useState(false);

  async function refresh() {
    const [open, ours] = await Promise.all([
      freight.loads().then(r => r.loads).catch(() => []),
      freight.loads({ mine: true }).then(r => r.loads).catch(() => []),
    ]);
    setBoard(open);
    setMine(ours);
  }

  useEffect(() => { refresh().finally(() => setLoading(false)); }, []);

  if (loading) return <Spinner />;

  return (
    <AppShell
      title={t('Freight', 'Usafirishaji')}
      subtitle={t('Load board', 'Mizigo')}
    >
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">
      <p className="text-sm text-ink/60 dark:text-sand/60">
        {t('Post cargo, or find loads that fit a trip you are already making.', 'Weka mzigo, au tafuta mizigo inayolingana na safari uliyonayo.')}
      </p>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <Pill active={tab === 'near'} onClick={() => setTab('near')}>
          {t('Near me', 'Karibu nami')}
        </Pill>
        <Pill active={tab === 'board'} onClick={() => setTab('board')}>
          {t('Find loads', 'Tafuta mizigo')} ({board.length})
        </Pill>
        <Pill active={tab === 'mine'} onClick={() => setTab('mine')}>
          {t('My loads', 'Mizigo yangu')} ({mine.length})
        </Pill>
        <Pill active={tab === 'lanes'} onClick={() => setTab('lanes')}>
          {t('My lanes', 'Njia zangu')}
        </Pill>
      </div>

      {tab === 'near' && <NearMe onChanged={refresh} />}

      {tab === 'board' && (
        <div className="mt-4">
          {board.length === 0 ? (
            <EmptyState icon={<Package size={40} />} title={t('No open loads right now', 'Hakuna mizigo kwa sasa')} />
          ) : (
            <div className="space-y-2">
              {board.map(l => <LoadCard key={l.id} load={l} onChanged={refresh} mode="carrier" />)}
            </div>
          )}
        </div>
      )}

      {tab === 'mine' && (
        <div className="mt-4">
          {!showLoadForm && (
            <Button className="mb-3 w-full" onClick={() => setShowLoadForm(true)}>
              <Plus size={16} /> {t('Post a load', 'Weka mzigo')}
            </Button>
          )}
          {showLoadForm && (
            <PostLoadForm onCancel={() => setShowLoadForm(false)}
              onPosted={async () => { setShowLoadForm(false); await refresh(); }} />
          )}
          {mine.length === 0 ? (
            <EmptyState icon={<Truck size={40} />} title={t('You have not posted any cargo', 'Hujaweka mzigo wowote')} />
          ) : (
            <div className="space-y-2">
              {mine.map(l => <LoadCard key={l.id} load={l} onChanged={refresh} mode="shipper" />)}
            </div>
          )}
        </div>
      )}

      {tab === 'lanes' && (
        <div className="mt-4">
          {!showLaneForm && (
            <Button className="mb-3 w-full" onClick={() => setShowLaneForm(true)}>
              <Plus size={16} /> {t('Post a lane I run', 'Weka njia ninayotumia')}
            </Button>
          )}
          {showLaneForm && (
            <PostLaneForm onCancel={() => setShowLaneForm(false)}
              onPosted={(lane) => { setShowLaneForm(false); setLanes(ls => [lane, ...ls]); }} />
          )}
          {lanes.length === 0 ? (
            <EmptyState
              icon={<RouteIcon size={40} />}
              title={t('No lanes posted', 'Hakuna njia')}
              sub={t('Tell us a trip you already make and we will show loads along the way.', 'Tuambie safari unayofanya na tutakuonyesha mizigo iliyo njiani.')}
            />
          ) : (
            <div className="space-y-3">{lanes.map(l => <LaneCard key={l.id} lane={l} />)}</div>
          )}
        </div>
      )}
    </div>
    </AppShell>
  );
}

// ── Near me: the driver's map ─────────────────────────────────────────────────

const RADII = [10, 25, 50, 100];

/**
 * Loads within reach of where the driver is standing.
 *
 * This is the opportunistic case — a boda rider or a truck between jobs opens
 * the map and takes whatever is close. Distinct from "My lanes", which fills a
 * trip already committed to.
 */
function NearMe({ onChanged }: { onChanged: () => void }) {
  const { t } = useT();
  const [pos, setPos]       = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(25);
  const [rows, setRows]     = useState<(Load & { pickupDistanceKm: number; haulKm: number })[]>([]);
  const [busy, setBusy]     = useState(false);
  const [denied, setDenied] = useState(false);

  function locate() {
    if (!navigator.geolocation) { setDenied(true); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      p => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => { setDenied(true); setBusy(false); },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  useEffect(() => { locate(); }, []);

  useEffect(() => {
    if (!pos) return;
    setBusy(true);
    freight.nearby({ lat: pos.lat, lng: pos.lng, radiusKm: radius })
      .then(r => setRows(r.loads))
      .catch(() => setRows([]))
      .finally(() => setBusy(false));
  }, [pos, radius]);

  // Pickup pins plus the driver, so distance is visible rather than just stated.
  const markers = pos
    ? [
        { lat: pos.lat, lng: pos.lng, kind: 'me' as const, label: t('You', 'Wewe') },
        ...rows.map(l => ({
          lat: l.originLat, lng: l.originLng, kind: 'vendor' as const, id: l.id,
          label: `${l.originLabel ?? t('Pickup', 'Kuchukua')} · ${l.weightKg.toLocaleString()} kg`,
        })),
      ]
    : [];

  if (denied && !pos) {
    return (
      <Card className="mt-4">
        <p className="py-4 text-center text-sm text-ink/60">
          {t('Location is needed to find loads near you.', 'Eneo linahitajika kupata mizigo iliyo karibu.')}
        </p>
        <Button className="w-full" onClick={locate}>{t('Try again', 'Jaribu tena')}</Button>
      </Card>
    );
  }

  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-ink/55">{t('Within', 'Ndani ya')}</span>
        {RADII.map(r => (
          <Pill key={r} active={radius === r} onClick={() => setRadius(r)}>{r} km</Pill>
        ))}
        <button onClick={locate} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-flame">
          <MapPin size={13} /> {t('Update my position', 'Sasisha eneo')}
        </button>
      </div>

      {pos && (
        <Card className="!p-1.5">
          <Map markers={markers} height={280} />
        </Card>
      )}

      <div className="mt-2 text-xs text-ink/50">
        {busy
          ? t('Searching…', 'Inatafuta…')
          : `${rows.length} ${rows.length === 1 ? t('load within', 'mzigo ndani ya') : t('loads within', 'mizigo ndani ya')} ${radius} km`}
      </div>

      {!busy && rows.length === 0 && pos && (
        <EmptyState
          icon={<Package size={40} />}
          title={t('Nothing to pick up here yet', 'Hakuna mzigo hapa bado')}
          sub={t('Try a wider radius, or check the full board.', 'Jaribu umbali mkubwa, au ona mizigo yote.')}
        />
      )}

      <div className="mt-2 space-y-2">
        {rows.map(l => (
          <div key={l.id}>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-leaf-dark">
              <MapPin size={11} />
              {l.pickupDistanceKm} km {t('away', 'kutoka hapa')}
              <span className="text-ink/40">· {t('haul', 'safari')} {l.haulKm} km</span>
            </div>
            <LoadCard load={l} onChanged={onChanged} mode="carrier" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Load card ─────────────────────────────────────────────────────────────────

function LoadCard({ load, onChanged, mode }: { load: Load; onChanged: () => void; mode: 'carrier' | 'shipper' }) {
  const { t } = useT();
  const [open, setOpen]     = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote]     = useState('');
  const [busy, setBusy]     = useState(false);
  const [quotes, setQuotes] = useState<FreightQuote[] | null>(null);

  async function bid() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return toast.error(t('Enter your price', 'Weka bei yako'));
    setBusy(true);
    try {
      // Minor units: the API stores integers, never floats.
      await freight.quote(load.id, { amountMinor: Math.round(value * 100), message: note.trim() || undefined });
      toast.success(t('Quote sent', 'Bei imetumwa'));
      setOpen(false); setAmount(''); setNote('');
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('Could not send the quote', 'Imeshindwa kutuma'));
    } finally { setBusy(false); }
  }

  async function showQuotes() {
    try {
      const r = await freight.load(load.id);
      setQuotes(r.load.quotes ?? []);
    } catch { toast.error(t('Could not load quotes', 'Imeshindwa kupakia bei')); }
  }

  async function accept(quoteId: string) {
    setBusy(true);
    try {
      await freight.acceptQuote(quoteId);
      toast.success(t('Awarded — tracking starts now', 'Imekubaliwa — ufuatiliaji unaanza'));
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('Could not award', 'Imeshindwa'));
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-bold text-ink dark:text-sand">
            <span className="truncate">{load.originLabel || km(0).replace('0.0 km', t('Pickup', 'Kuchukua'))}</span>
            <ArrowRight size={13} className="shrink-0 text-ink/40" />
            <span className="truncate">{load.destLabel || t('Drop', 'Kufikisha')}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink/55">
            <span className="inline-flex items-center gap-1"><Weight size={11} /> {load.weightKg.toLocaleString()} kg</span>
            <span className="inline-flex items-center gap-1"><Clock size={11} /> {day(load.pickupFrom)}–{day(load.pickupTo)}</span>
            <span>{load.cargoType}</span>
            {load.needsRefrigeration && <span className="text-blue-600">{t('refrigerated', 'jokofu')}</span>}
            {load.isHazmat && <span className="text-danger">{t('hazmat', 'hatari')}</span>}
          </div>
        </div>
        <span className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
          load.status === 'AWARDED' ? 'bg-leaf/15 text-leaf-dark' : 'bg-amber-100 text-amber-700',
        )}>{load.status}</span>
      </div>

      {load.budgetMinor != null && (
        <div className="mt-1 text-xs text-ink/50">
          {t('Budget', 'Bajeti')}: {formatMinor(load.budgetMinor, load.currency)}
        </div>
      )}

      {mode === 'carrier' && load.status !== 'AWARDED' && (
        open ? (
          <div className="mt-3 space-y-2">
            <Field label={t('Your price', 'Bei yako')} type="number" inputMode="decimal"
              value={amount} onChange={e => setAmount(e.target.value)} />
            <Field label={t('Message (optional)', 'Ujumbe (hiari)')}
              value={note} onChange={e => setNote(e.target.value)} />
            <div className="flex gap-2">
              <Button className="flex-1" loading={busy} onClick={bid}>{t('Send quote', 'Tuma bei')}</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>{t('Cancel', 'Ghairi')}</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="mt-3 w-full" onClick={() => setOpen(true)}>
            {t('Quote on this load', 'Toa bei')}
          </Button>
        )
      )}

      {mode === 'shipper' && (
        <div className="mt-3">
          {quotes === null ? (
            <Button variant="ghost" className="w-full" onClick={showQuotes}>
              {t('See quotes', 'Ona bei')} {load._count?.quotes ? `(${load._count.quotes})` : ''}
            </Button>
          ) : quotes.length === 0 ? (
            <p className="text-center text-xs text-ink/45">{t('No quotes yet', 'Hakuna bei bado')}</p>
          ) : (
            <div className="space-y-1.5">
              {quotes.map(q => (
                <div key={q.id} className="flex items-center gap-2 rounded-xl bg-black/5 p-2 dark:bg-white/5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 truncate text-sm font-semibold text-ink dark:text-sand">
                      {q.bidder?.name ?? t('Carrier', 'Msafirishaji')}
                      {q.bidder?.isVerified && <BadgeCheck size={12} className="shrink-0 text-leaf-dark" />}
                    </div>
                    {q.message && <div className="truncate text-[11px] text-ink/50">{q.message}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-bold tabular-nums text-flame">{formatMinor(q.amountMinor, q.currency)}</div>
                    {load.status !== 'AWARDED' && q.status === 'PENDING' && (
                      <button onClick={() => accept(q.id)} disabled={busy}
                        className="text-[11px] font-semibold text-leaf-dark hover:underline">
                        {t('Accept', 'Kubali')}
                      </button>
                    )}
                    {q.status === 'ACCEPTED' && (
                      <span className="text-[11px] font-semibold text-leaf-dark">{t('Awarded', 'Imekubaliwa')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Lane card + matches ───────────────────────────────────────────────────────

function LaneCard({ lane }: { lane: CarrierLane }) {
  const { t } = useT();
  const [matches, setMatches] = useState<{ load: Load; detourKm: number }[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function find() {
    setBusy(true);
    try {
      const r = await freight.matches(lane.id);
      setMatches(r.matches);
      if (r.matches.length === 0) toast(t('No loads on this lane yet', 'Hakuna mizigo kwenye njia hii'));
    } catch { toast.error(t('Could not search', 'Imeshindwa kutafuta')); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <div className="flex items-center gap-1.5 text-sm font-bold text-ink dark:text-sand">
        <MapPin size={13} className="shrink-0 text-flame" />
        <span className="truncate">{lane.originLabel || t('Origin', 'Anzia')}</span>
        <ArrowRight size={13} className="shrink-0 text-ink/40" />
        <span className="truncate">{lane.destLabel || t('Destination', 'Fika')}</span>
      </div>
      <div className="mt-1 text-xs text-ink/55">
        {day(lane.departsAt)} · {lane.capacityKgFree.toLocaleString()} kg {t('spare', 'nafasi')} · ±{lane.corridorKm} km
      </div>

      <Button variant="outline" className="mt-3 w-full" loading={busy} onClick={find}>
        {t('Find loads along this lane', 'Tafuta mizigo njiani')}
      </Button>

      {matches && matches.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {matches.map(m => (
            <div key={m.load.id} className="rounded-xl bg-black/5 p-2 text-xs dark:bg-white/5">
              <div className="font-semibold text-ink dark:text-sand">
                {m.load.originLabel || '—'} → {m.load.destLabel || '—'}
              </div>
              <div className="text-ink/55">
                {m.load.weightKg.toLocaleString()} kg · {t('detour', 'mkato')} {km(m.detourKm)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Forms ─────────────────────────────────────────────────────────────────────

/** Uses the browser's location for the pickup point, which is the common case. */
function PostLoadForm({ onCancel, onPosted }: { onCancel: () => void; onPosted: () => void }) {
  const { t } = useT();
  const [f, setF] = useState({
    originLabel: '', destLabel: '', weightKg: '', cargoType: 'general',
    originLat: '', originLng: '', destLat: '', destLng: '',
    pickupFrom: new Date(Date.now() + 864e5).toISOString().slice(0, 10),
    pickupTo:   new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10),
    budget: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(s => ({ ...s, [k]: e.target.value }));

  function useMyLocation() {
    navigator.geolocation?.getCurrentPosition(
      p => { setF(s => ({ ...s, originLat: String(p.coords.latitude), originLng: String(p.coords.longitude) })); toast.success(t('Pickup pinned', 'Eneo limewekwa')); },
      () => toast.error(t("Couldn't get location", 'Imeshindwa kupata eneo')),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const nums = ['originLat', 'originLng', 'destLat', 'destLng'].map(k => Number((f as any)[k]));
    if (nums.some(n => !Number.isFinite(n))) return toast.error(t('Pickup and drop coordinates are required', 'Viratibu vinahitajika'));
    if (!(Number(f.weightKg) > 0)) return toast.error(t('Enter the weight', 'Weka uzito'));

    setBusy(true);
    try {
      await freight.postLoad({
        originLat: nums[0], originLng: nums[1], destLat: nums[2], destLng: nums[3],
        originLabel: f.originLabel || undefined, destLabel: f.destLabel || undefined,
        pickupFrom: new Date(f.pickupFrom).toISOString(),
        pickupTo:   new Date(f.pickupTo).toISOString(),
        weightKg: Number(f.weightKg),
        cargoType: f.cargoType || 'general',
        ...(Number(f.budget) > 0 ? { budgetMinor: Math.round(Number(f.budget) * 100) } : {}),
      });
      toast.success(t('Load posted', 'Mzigo umewekwa'));
      onPosted();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('Could not post', 'Imeshindwa'));
    } finally { setBusy(false); }
  }

  return (
    <Card className="mb-3">
      <form onSubmit={submit} className="space-y-3">
        <Field label={t('Pickup place', 'Mahali pa kuchukua')} value={f.originLabel} onChange={set('originLabel')} placeholder="Dar es Salaam" />
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('Pickup lat', 'Latitudo')} value={f.originLat} onChange={set('originLat')} />
          <Field label={t('Pickup lng', 'Longitudo')} value={f.originLng} onChange={set('originLng')} />
        </div>
        <button type="button" onClick={useMyLocation} className="text-xs font-semibold text-flame">
          {t('Use my current location', 'Tumia eneo langu')}
        </button>

        <Field label={t('Drop place', 'Mahali pa kufikisha')} value={f.destLabel} onChange={set('destLabel')} placeholder="Mwanza" />
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('Drop lat', 'Latitudo')} value={f.destLat} onChange={set('destLat')} />
          <Field label={t('Drop lng', 'Longitudo')} value={f.destLng} onChange={set('destLng')} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label={t('Weight (kg)', 'Uzito (kg)')} type="number" inputMode="decimal" value={f.weightKg} onChange={set('weightKg')} />
          <Field label={t('Cargo type', 'Aina ya mzigo')} value={f.cargoType} onChange={set('cargoType')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('Pickup from', 'Kuanzia')} type="date" value={f.pickupFrom} onChange={set('pickupFrom')} />
          <Field label={t('Pickup by', 'Hadi')} type="date" value={f.pickupTo} onChange={set('pickupTo')} />
        </div>
        <Field label={t('Budget (optional)', 'Bajeti (hiari)')} type="number" inputMode="decimal" value={f.budget} onChange={set('budget')} />

        <div className="flex gap-2">
          <Button type="submit" loading={busy} className="flex-1">{t('Post load', 'Weka mzigo')}</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>{t('Cancel', 'Ghairi')}</Button>
        </div>
      </form>
    </Card>
  );
}

function PostLaneForm({ onCancel, onPosted }: { onCancel: () => void; onPosted: (l: CarrierLane) => void }) {
  const { t } = useT();
  const [f, setF] = useState({
    originLabel: '', destLabel: '', originLat: '', originLng: '', destLat: '', destLng: '',
    departsAt: new Date(Date.now() + 864e5).toISOString().slice(0, 10),
    capacityKgFree: '', corridorKm: '60',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(s => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const nums = ['originLat', 'originLng', 'destLat', 'destLng'].map(k => Number((f as any)[k]));
    if (nums.some(n => !Number.isFinite(n))) return toast.error(t('Coordinates are required', 'Viratibu vinahitajika'));
    if (!(Number(f.capacityKgFree) > 0)) return toast.error(t('Enter your spare capacity', 'Weka nafasi uliyonayo'));

    setBusy(true);
    try {
      const r = await freight.postRoute({
        originLat: nums[0], originLng: nums[1], destLat: nums[2], destLng: nums[3],
        originLabel: f.originLabel || undefined, destLabel: f.destLabel || undefined,
        departsAt: new Date(f.departsAt).toISOString(),
        capacityKgFree: Number(f.capacityKgFree),
        corridorKm: Number(f.corridorKm) || 60,
      });
      toast.success(t('Lane posted', 'Njia imewekwa'));
      onPosted(r.route);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('Could not post the lane', 'Imeshindwa'));
    } finally { setBusy(false); }
  }

  return (
    <Card className="mb-3">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-ink/55">
          {t('A trip you already make. We match open loads whose pickup and drop both sit near it, in your direction of travel.',
             'Safari unayofanya tayari. Tunalinganisha mizigo iliyo karibu na njia hiyo, kwa mwelekeo wako.')}
        </p>
        <Field label={t('From', 'Kutoka')} value={f.originLabel} onChange={set('originLabel')} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="lat" value={f.originLat} onChange={set('originLat')} />
          <Field label="lng" value={f.originLng} onChange={set('originLng')} />
        </div>
        <Field label={t('To', 'Kwenda')} value={f.destLabel} onChange={set('destLabel')} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="lat" value={f.destLat} onChange={set('destLat')} />
          <Field label="lng" value={f.destLng} onChange={set('destLng')} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label={t('Departs', 'Kuondoka')} type="date" value={f.departsAt} onChange={set('departsAt')} />
          <Field label={t('Spare kg', 'Nafasi kg')} type="number" value={f.capacityKgFree} onChange={set('capacityKgFree')} />
          <Field label={t('Detour km', 'Mkato km')} type="number" value={f.corridorKm} onChange={set('corridorKm')} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" loading={busy} className="flex-1">{t('Post lane', 'Weka njia')}</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>{t('Cancel', 'Ghairi')}</Button>
        </div>
      </form>
    </Card>
  );
}
