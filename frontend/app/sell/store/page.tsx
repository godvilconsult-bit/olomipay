'use client';

/**
 * Store details — the address and contact shown on the public storefront.
 *
 * Address fields are generic (line 1/2, city, state, postcode, country) rather
 * than Tanzania's region/district/ward, so a seller anywhere can be described.
 * Local subdivisions still fit: they go in adminLevels on the API side.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, MapPin, ExternalLink, Navigation } from 'lucide-react';
import { listings, ApiError } from '../../../lib/api';
import { Button, Card, Field, Spinner } from '../../../components/ui';
import { useT } from '../../../lib/i18n';

const FIELDS: { key: string; en: string; sw: string; placeholder?: string }[] = [
  { key: 'name',         en: 'Store name',      sw: 'Jina la duka' },
  { key: 'addressLine1', en: 'Address line 1',  sw: 'Anwani mstari 1', placeholder: 'Street, building' },
  { key: 'addressLine2', en: 'Address line 2',  sw: 'Anwani mstari 2', placeholder: 'Area, landmark' },
  { key: 'city',         en: 'City / town',     sw: 'Jiji / mji' },
  { key: 'state',        en: 'State / region',  sw: 'Jimbo / mkoa' },
  { key: 'postalCode',   en: 'Postal code',     sw: 'Msimbo wa posta' },
  { key: 'countryCode',  en: 'Country code',    sw: 'Msimbo wa nchi', placeholder: 'TZ, KE, UG…' },
  { key: 'contactPhone', en: 'Contact phone',   sw: 'Simu ya mawasiliano' },
  { key: 'contactEmail', en: 'Contact email',   sw: 'Barua pepe' },
];

export default function StorePage() {
  const { t } = useT();
  const [form, setForm]   = useState<Record<string, string>>({});
  const [slug, setSlug]   = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    listings.store()
      .then(r => {
        const s = r.store ?? {};
        setSlug(s.slug ?? '');
        setForm(Object.fromEntries(
          [...FIELDS.map(f => f.key), 'description'].map(k => [k, s[k] ?? '']),
        ));
        if (s.lat != null && s.lng != null) setCoords({ lat: s.lat, lng: s.lng });
      })
      .catch(e => setBlocked(e instanceof ApiError && e.status === 403
        ? t('This account is not set up to sell yet.', 'Akaunti hii bado haijawekwa kuuza.')
        : t('Could not load your store.', 'Imeshindwa kupakia duka.')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  function pinLocation() {
    if (!navigator.geolocation) return toast.error(t('Location not available', 'Eneo halipatikani'));
    navigator.geolocation.getCurrentPosition(
      p => { setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }); toast.success(t('Location pinned', 'Eneo limewekwa')); },
      () => toast.error(t("Couldn't get location", 'Imeshindwa kupata eneo')),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Only send filled fields: the API treats every field as optional, and
      // sending empty strings would blank values the seller never touched.
      const body: Record<string, any> = {};
      for (const [k, v] of Object.entries(form)) if (v.trim()) body[k] = v.trim();
      if (coords) { body.lat = coords.lat; body.lng = coords.lng; }

      await listings.saveStore(body);
      toast.success(t('Store updated', 'Duka limehifadhiwa'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('Could not save', 'Imeshindwa kuhifadhi'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-4">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/sell" aria-label={t('Back', 'Rudi')} className="text-ink/60 hover:text-flame">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="flex-1 text-2xl font-extrabold text-ink dark:text-sand">{t('Store details', 'Maelezo ya duka')}</h1>
        {slug && (
          <Link href={`/shop/s/${slug}`} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-flame">
            {t('View', 'Ona')} <ExternalLink size={14} />
          </Link>
        )}
      </div>

      {blocked ? (
        <Card><p className="py-6 text-center text-sm text-ink/60">{blocked}</p></Card>
      ) : (
        <Card>
          <form onSubmit={save} className="space-y-4">
            {FIELDS.map(f => (
              <Field
                key={f.key}
                label={t(f.en, f.sw)}
                placeholder={f.placeholder}
                value={form[f.key] ?? ''}
                onChange={set(f.key)}
                maxLength={f.key === 'countryCode' ? 2 : undefined}
              />
            ))}

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink/70 dark:text-sand/70">
                {t('About your store', 'Kuhusu duka lako')}
              </span>
              <textarea
                rows={4}
                value={form.description ?? ''}
                onChange={set('description')}
                maxLength={2000}
                placeholder={t('What you sell, opening hours, delivery areas…', 'Unauza nini, saa za kufungua, maeneo ya usafirishaji…')}
                className="w-full rounded-2xl border border-black/10 bg-white p-4 text-ink outline-none focus:border-flame dark:border-white/10 dark:bg-ink-2 dark:text-sand"
              />
            </label>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink/70 dark:text-sand/70">
                {t('Map location', 'Eneo kwenye ramani')}
              </span>
              <button
                type="button"
                onClick={pinLocation}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-flame/10 py-3 text-sm font-semibold text-flame"
              >
                <Navigation size={16} />
                {coords
                  ? `${t('Pinned', 'Imewekwa')} ✓ (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`
                  : t('Use my current location', 'Tumia eneo langu')}
              </button>
              <p className="mt-1.5 flex items-center gap-1 text-xs text-ink/45">
                <MapPin size={11} />
                {t('Buyers use this to estimate delivery.', 'Wanunuzi hutumia hii kukadiria usafirishaji.')}
              </p>
            </div>

            <Button type="submit" loading={saving} className="w-full">{t('Save store', 'Hifadhi duka')}</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
