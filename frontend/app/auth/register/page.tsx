'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { Flame, Home, Store, Bike, Navigation, Warehouse, Megaphone } from 'lucide-react';
import { auth, setTokens, ApiError, Role } from '../../../lib/api';
import { useT, LangToggle } from '../../../lib/i18n';
import { Button, Field, cn } from '../../../components/ui';
import { TZ_REGIONS } from '../../../lib/tanzania';
import { reverseGeocode } from '../../../lib/geocode';

const Map = dynamic(() => import('../../../components/Map'), { ssr: false });

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useT();
  const [role, setRole] = useState<Role>('HOUSEHOLD');
  const [form, setForm] = useState({ name: '', phone: '', pin: '', region: 'Dar es Salaam', businessName: '', vehicleType: 'MOTORBIKE', referralCode: '' });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [nextPath, setNextPath] = useState<string | null>(null);
  // Pre-fill from a shared link: ?ref=CODE (invite), ?role=SUPPLIER (pre-select
  // role, used by the "Start selling" links), ?next=/path (return after signup).
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      if (ref) setForm((f) => ({ ...f, referralCode: ref.toUpperCase() }));
      const r = params.get('role')?.toUpperCase();
      if (r && ['HOUSEHOLD', 'SUPPLIER', 'RIDER', 'DISTRIBUTOR', 'BRAND'].includes(r)) setRole(r as Role);
      setNextPath(params.get('next'));
    } catch {}
  }, []);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const [detected, setDetected] = useState('');
  function getLocation() {
    if (!navigator.geolocation) return toast.error(t('GPS unavailable', 'GPS haipatikani'));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const lat = p.coords.latitude, lng = p.coords.longitude;
        setCoords({ lat, lng }); setLocating(false); toast.success(t('Location captured', 'Eneo limepatikana'));
        // Auto-detect region/district from the map and fill it in.
        const g = await reverseGeocode(lat, lng);
        if (g) {
          if (g.region && TZ_REGIONS.includes(g.region)) setForm((f) => ({ ...f, region: g.region }));
          setDetected([g.ward, g.district, g.region].filter(Boolean).join(', '));
        }
      },
      () => { setLocating(false); toast.error(t("Couldn't get location", 'Imeshindwa kupata eneo')); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
  const locLabel = role === 'SUPPLIER' ? t('Pin your shop location', 'Weka eneo la duka')
    : role === 'DISTRIBUTOR' ? t('Pin your depot location', 'Weka eneo la ghala')
    : role === 'RIDER' ? t('Share your current location', 'Shiriki eneo lako sasa')
    : t('Pin your delivery location', 'Weka eneo la kupokelea');

  // Marketplace roles, not gas roles. The underlying Role enum is unchanged so
  // no existing account or permission check breaks; only what a person is
  // asked to identify as has changed. A seller here lists any category, and a
  // wholesaler is simply a seller whose offers carry a minimum order quantity.
  const ROLES: { value: Role; label: string; sub: string; icon: any }[] = [
    { value: 'HOUSEHOLD',   label: t('Buyer', 'Mnunuzi'),          sub: t('Buy anything', 'Nunua chochote'),        icon: Home },
    { value: 'SUPPLIER',    label: t('Seller', 'Muuzaji'),         sub: t('Sell your products', 'Uza bidhaa zako'), icon: Store },
    { value: 'RIDER',       label: t('Transporter', 'Msafirishaji'), sub: t('Deliver & haul', 'Sambaza & safirisha'), icon: Bike },
    { value: 'DISTRIBUTOR', label: t('Wholesaler', 'Mfanyabiashara wa jumla'), sub: t('Supply in bulk', 'Uza kwa jumla'), icon: Warehouse },
    { value: 'BRAND',       label: t('Brand', 'Kampuni'),          sub: t('Advertise & leads', 'Tangaza'),          icon: Megaphone },
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^0\d{9}$/.test(form.phone.replace(/\s/g, ''))) return toast.error(t('Enter phone as 0712345678', 'Weka simu kama 0712345678'));
    if (!/^\d{4}$/.test(form.pin)) return toast.error(t('PIN must be 4 digits', 'PIN lazima iwe tarakimu 4'));
    setLoading(true);
    try {
      const res = await auth.register({
        phone: form.phone, pin: form.pin, role, name: form.name, region: form.region,
        ...((role === 'SUPPLIER' || role === 'DISTRIBUTOR' || role === 'BRAND') && { businessName: form.businessName || form.name }),
        ...(role === 'RIDER' && { vehicleType: form.vehicleType }),
        ...(coords && { lat: coords.lat, lng: coords.lng }),
        ...(form.referralCode && { referralCode: form.referralCode }),
      } as any);
      setTokens(res.accessToken, res.refreshToken);
      toast.success(t('Account created!', 'Akaunti imefunguliwa!'));
      // Back to whatever they were looking at, if anything. Otherwise buyers
      // land in the marketplace, while sellers and transporters go to the
      // dashboard to finish setting up shop or vehicle details.
      //
      // Only same-origin paths are followed: `next` comes from the URL, so a
      // scheme or protocol-relative value would be an open redirect.
      const raw = nextPath;
      const safe = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
      router.replace(safe ?? (role === 'HOUSEHOLD' ? '/shop' : '/dashboard'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('Sign up failed', 'Usajili umeshindikana'));
    } finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen bg-sand">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-grad-brand text-white"><Flame size={20} /></span>
            <span className="text-lg font-extrabold">JIKO CONNECT</span>
          </Link>
          <LangToggle />
        </div>

        <h1 className="mt-6 text-2xl font-extrabold">{t('Create account', 'Fungua akaunti')}</h1>
        <p className="mt-1 text-sm text-ink/60">{t('How will you use the marketplace?', 'Utatumiaje soko hili?')}</p>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {ROLES.map((r) => {
            const Icon = r.icon; const active = role === r.value;
            return (
              <button key={r.value} type="button" onClick={() => setRole(r.value)} className={cn('rounded-2xl border p-3 text-center transition', active ? 'border-flame bg-flame/10' : 'border-black/10 bg-white')}>
                <div className={cn('mx-auto mb-1 grid h-10 w-10 place-items-center rounded-xl', active ? 'bg-grad-brand text-white' : 'bg-black/5 text-ink/60')}><Icon size={20} /></div>
                <div className="text-sm font-semibold">{r.label}</div>
                <div className="text-[11px] text-ink/50">{r.sub}</div>
              </button>
            );
          })}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label={t('Name', 'Jina')} placeholder={t('Your name', 'Jina lako')} value={form.name} onChange={set('name')} required />
          <Field label={t('Phone number', 'Namba ya simu')} type="tel" inputMode="numeric" maxLength={10} placeholder="0712345678" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))} required />

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink/70">{t('Region', 'Mkoa')}</span>
            <select value={form.region} onChange={set('region')} className="w-full min-h-touch rounded-2xl border border-black/10 bg-white px-4 text-ink outline-none focus:border-flame">
              {TZ_REGIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>

          {(role === 'SUPPLIER' || role === 'DISTRIBUTOR' || role === 'BRAND') && <Field label={role === 'BRAND' ? t('Brand name', 'Jina la kampuni') : t('Business name', 'Jina la biashara')} placeholder={role === 'BRAND' ? t('Your company name', 'Jina la kampuni yako') : role === 'DISTRIBUTOR' ? t('Your wholesale business', 'Biashara yako ya jumla') : t('Your shop name', 'Jina la duka lako')} value={form.businessName} onChange={set('businessName')} />}
          {role === 'RIDER' && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink/70">{t('Vehicle', 'Chombo')}</span>
              <select value={form.vehicleType} onChange={set('vehicleType')} className="w-full min-h-touch rounded-2xl border border-black/10 bg-white px-4 text-ink outline-none focus:border-flame">
                <option value="MOTORBIKE">{t('Motorbike', 'Pikipiki')}</option>
                <option value="BAJAJI">{t('Bajaji', 'Bajaji')}</option>
                <option value="BICYCLE">{t('Bicycle', 'Baiskeli')}</option>
                <option value="CAR">{t('Car', 'Gari')}</option>
                <option value="TRUCK">{t('Truck', 'Lori')}</option>
              </select>
            </label>
          )}

          {role !== 'BRAND' && (
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink/70">{locLabel}</span>
            <button type="button" onClick={getLocation} className={cn('flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold', coords ? 'bg-leaf/15 text-leaf-dark' : 'bg-flame/10 text-flame')}>
              <Navigation size={16} /> {locating ? t('Locating…', 'Inatafuta…') : coords ? `${t('Location set', 'Eneo limewekwa')} ✓` : t('Use my live location (GPS)', 'Tumia eneo langu (GPS)')}
            </button>
            {detected && <p className="mt-1.5 text-xs text-leaf-dark">📍 {detected}</p>}
            {coords && <div className="mt-2"><Map markers={[{ lat: coords.lat, lng: coords.lng, kind: 'me', label: t('You', 'Wewe') }]} height={170} /></div>}
          </div>
          )}

          <Field label={t('Create a 4-digit PIN', 'Weka PIN ya tarakimu 4')} type="password" inputMode="numeric" maxLength={4} placeholder="••••" value={form.pin} onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))} required />
          <Field label={t('Invite code (optional)', 'Namba ya mwaliko (hiari)')} placeholder="JKXXXXX" value={form.referralCode} onChange={(e) => setForm((f) => ({ ...f, referralCode: e.target.value.toUpperCase() }))} />
          <Button type="submit" loading={loading} className="w-full">{t('Create account', 'Fungua akaunti')}</Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink/60">
          {t('Have an account?', 'Una akaunti?')} <Link href="/auth/login" className="font-semibold text-flame">{t('Sign in', 'Ingia')}</Link>
        </p>
      </div>
    </main>
  );
}
