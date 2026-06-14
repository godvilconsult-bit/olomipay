'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { ArrowLeft, MapPin, Navigation, Star, Trash2, Plus } from 'lucide-react';
import { addresses } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { TZ_REGIONS, TZ_DISTRICTS } from '../../lib/tanzania';
import { reverseGeocode } from '../../lib/geocode';
import { Card, Button, Field, Spinner, EmptyState, cn } from '../../components/ui';
import { RoleNav } from '../../components/RoleNav';

const Map = dynamic(() => import('../../components/Map'), { ssr: false });
const blank = { label: 'Home', region: 'Dar es Salaam', district: '', ward: '', lat: null as number | null, lng: null as number | null };

export default function AddressesPage() {
  const router = useRouter();
  const { t } = useT();
  const [list, setList] = useState<any[] | null>(null);
  const [form, setForm] = useState<any>({ ...blank });
  const [busy, setBusy] = useState(false);

  async function load() { try { const r = await addresses.list(); setList(r.addresses ?? []); } catch { setList([]); } }
  useEffect(() => { load(); }, []);

  function gps() {
    if (!navigator.geolocation) return toast.error(t('GPS unavailable', 'GPS haipatikani'));
    navigator.geolocation.getCurrentPosition(async (p) => {
      const lat = p.coords.latitude, lng = p.coords.longitude;
      setForm((f: any) => ({ ...f, lat, lng }));
      toast.success(t('Location found — filling address', 'Eneo limepatikana — inajaza anwani'));
      const g = await reverseGeocode(lat, lng);
      if (g) setForm((f: any) => ({ ...f, region: (g.region && TZ_REGIONS.includes(g.region)) ? g.region : f.region, district: g.district || f.district, ward: g.ward || f.ward }));
    }, () => toast.error(t('Failed', 'Imeshindwa')), { enableHighAccuracy: true, timeout: 10000 });
  }
  async function add() {
    if (form.lat == null) return toast.error(t('Tap GPS to get your location', 'Bonyeza GPS kupata eneo'));
    setBusy(true);
    try { await addresses.create({ label: form.label, region: form.region, district: form.district || undefined, ward: form.ward || undefined, lat: form.lat, lng: form.lng }); setForm({ ...blank }); await load(); toast.success(t('Address added', 'Anwani imeongezwa')); }
    catch { toast.error(t('Failed', 'Imeshindikana')); } finally { setBusy(false); }
  }
  async function makeDefault(id: string) { await addresses.setDefault(id).catch(() => {}); load(); }
  async function remove(id: string) { await addresses.remove(id).catch(() => {}); load(); }

  if (list === null) return <div className="min-h-screen bg-sand"><Spinner /></div>;
  const districts = TZ_DISTRICTS[form.region] ?? [];

  return (
    <div className="min-h-screen bg-sand pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/90 px-4 py-3 backdrop-blur">
        <button onClick={() => router.replace('/dashboard')} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5"><ArrowLeft size={18} /></button>
        <h1 className="font-extrabold">{t('My addresses', 'Anwani zangu')}</h1>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        {list.length === 0 ? <EmptyState icon={<MapPin size={34} />} title={t('No addresses yet', 'Bado huna anwani')} sub={t('Add where you receive your gas.', 'Ongeza eneo lako la kupokelea gesi.')} /> :
          <div className="space-y-2">
            {list.map((a) => (
              <Card key={a.id} className="flex items-center gap-3 !p-3">
                <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-flame/10 text-flame"><MapPin size={18} /></span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 font-semibold">{a.label} {a.isDefault && <Star size={13} className="fill-ember text-ember" />}</div>
                  <div className="truncate text-xs text-ink/50">{[a.ward, a.district, a.region].filter(Boolean).join(', ') || `${a.lat.toFixed(4)}, ${a.lng.toFixed(4)}`}</div>
                </div>
                {!a.isDefault && <button onClick={() => makeDefault(a.id)} className="flex-shrink-0 rounded-lg bg-black/5 px-2 py-1 text-xs font-medium">{t('Set default', 'Weka kuu')}</button>}
                <button onClick={() => remove(a.id)} className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-danger"><Trash2 size={16} /></button>
              </Card>
            ))}
          </div>
        }

        <Card>
          <div className="mb-2 flex items-center gap-1.5 font-bold"><Plus size={16} className="text-flame" /> {t('Add address', 'Ongeza anwani')}</div>
          <div className="space-y-3">
            <button onClick={gps} className={cn('flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold', form.lat != null ? 'bg-leaf/15 text-leaf-dark' : 'border border-flame/40 bg-flame/5 text-flame')}>
              <Navigation size={16} /> {form.lat != null ? `${t('Location set', 'Eneo limewekwa')} ✓` : t('Use my live location (GPS)', 'Tumia eneo langu (GPS)')}
            </button>
            {form.lat != null && <Map markers={[{ lat: form.lat, lng: form.lng, kind: 'me', label: t('You', 'Wewe') }]} height={150} />}

            <Field label={t('Label (e.g. Home, Work)', 'Jina (mfano: Nyumbani, Kazini)')} value={form.label} onChange={(e) => setForm((f: any) => ({ ...f, label: e.target.value }))} />
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink/70">{t('Region', 'Mkoa')}</span>
              <select value={form.region} onChange={(e) => setForm((f: any) => ({ ...f, region: e.target.value, district: '' }))} className="w-full min-h-touch rounded-2xl border border-black/15 bg-white px-3 text-ink outline-none focus:border-flame">
                {TZ_REGIONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink/70">{t('District', 'Wilaya')}</span>
                <select value={form.district} onChange={(e) => setForm((f: any) => ({ ...f, district: e.target.value }))} className="w-full min-h-touch rounded-2xl border border-black/15 bg-white px-3 text-ink outline-none focus:border-flame">
                  <option value="">{t('Select', 'Chagua')}</option>
                  {districts.map((d) => <option key={d}>{d}</option>)}
                  {form.district && !districts.includes(form.district) && <option>{form.district}</option>}
                </select>
              </label>
              <Field label={t('Ward / Street', 'Kata / Mtaa')} value={form.ward} onChange={(e) => setForm((f: any) => ({ ...f, ward: e.target.value }))} />
            </div>
            <Button variant="primary" className="w-full" loading={busy} onClick={add}>{t('Save address', 'Hifadhi anwani')}</Button>
          </div>
        </Card>
      </div>
      <RoleNav role="HOUSEHOLD" />
    </div>
  );
}
