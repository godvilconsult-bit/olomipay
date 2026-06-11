'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { ArrowLeft, Navigation, Store, Save } from 'lucide-react';
import { suppliers } from '../../../lib/api';
import { useT } from '../../../lib/i18n';
import { Card, Button, Field, Spinner, cn } from '../../../components/ui';
import { RoleNav } from '../../../components/RoleNav';
import { TZ_REGIONS, TZ_DISTRICTS } from '../../../lib/tanzania';
import { reverseGeocode } from '../../../lib/geocode';

const Map = dynamic(() => import('../../../components/Map'), { ssr: false });

export default function SupplierSetup() {
  const router = useRouter();
  const { t } = useT();
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    suppliers.me().then((r) => setForm(r.profile)).catch((e) => { if (e?.status === 403) router.replace('/dashboard'); });
  }, [router]);

  function useLocation() {
    if (!navigator.geolocation) return toast.error(t('GPS unavailable', 'GPS haipatikani'));
    navigator.geolocation.getCurrentPosition(async (p) => {
      const lat = p.coords.latitude, lng = p.coords.longitude;
      setForm((f: any) => ({ ...f, lat, lng })); toast.success(t('Location set', 'Eneo limewekwa'));
      const g = await reverseGeocode(lat, lng);
      if (g) setForm((f: any) => ({ ...f, region: (g.region && TZ_REGIONS.includes(g.region)) ? g.region : f.region, district: g.district || f.district, ward: g.ward || f.ward }));
    }, () => toast.error(t("Couldn't get location", 'Imeshindwa kupata eneo')), { enableHighAccuracy: true });
  }
  async function save() {
    setSaving(true);
    try {
      await suppliers.update({ businessName: form.businessName, phone: form.phone, region: form.region, district: form.district || undefined, ward: form.ward || undefined, distributor: form.distributor || undefined, lat: form.lat ?? undefined, lng: form.lng ?? undefined, isOpen: form.isOpen });
      toast.success(t('Settings saved', 'Mpangilio umehifadhiwa'));
    } catch { toast.error(t('Failed', 'Imeshindikana')); } finally { setSaving(false); }
  }

  if (!form) return <div className="min-h-screen bg-sand"><Spinner /></div>;

  return (
    <div className="min-h-screen bg-sand pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/90 px-4 py-3 backdrop-blur">
        <button onClick={() => router.replace('/dashboard')} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5"><ArrowLeft size={18} /></button>
        <h1 className="font-extrabold">{t('Shop setup', 'Mpangilio wa duka')}</h1>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        <Card className="space-y-3">
          <Field label={t('Business name', 'Jina la biashara')} value={form.businessName ?? ''} onChange={set('businessName')} />
          <Field label={t('Phone', 'Simu')} value={form.phone ?? ''} onChange={set('phone')} />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink/70">{t('Region', 'Mkoa')}</span>
            <select value={form.region ?? ''} onChange={(e) => setForm((f: any) => ({ ...f, region: e.target.value, district: '' }))} className="w-full min-h-touch rounded-2xl border border-black/15 bg-white px-4 text-ink outline-none focus:border-flame">
              {TZ_REGIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink/70">{t('District', 'Wilaya')}</span>
              <select value={form.district ?? ''} onChange={set('district')} className="w-full min-h-touch rounded-2xl border border-black/15 bg-white px-3 text-ink outline-none focus:border-flame">
                <option value="">{t('Select', 'Chagua')}</option>
                {(TZ_DISTRICTS[form.region] ?? []).map((d) => <option key={d}>{d}</option>)}
                {form.district && !(TZ_DISTRICTS[form.region] ?? []).includes(form.district) && <option>{form.district}</option>}
              </select>
            </label>
            <Field label={t('Ward', 'Kata')} value={form.ward ?? ''} onChange={set('ward')} />
          </div>
          <Field label={t('Distributor (for restock)', 'Distributor (kujaza stock)')} value={form.distributor ?? ''} onChange={set('distributor')} hint={t('e.g. Oryx Depot Dar', 'mfano: Oryx Depot Dar')} />
        </Card>

        <Card>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-bold">{t('Shop location', 'Eneo la duka')}</span>
            <Button variant="outline" className="!min-h-0 !py-2 !text-sm" onClick={useLocation}><Navigation size={15} /> {t('Use GPS', 'Tumia GPS')}</Button>
          </div>
          {form.lat && form.lng ? <Map markers={[{ lat: form.lat, lng: form.lng, kind: 'vendor', label: form.businessName }]} height={180} /> :
            <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning">{t('Set your location so nearby customers can find you in search.', 'Weka eneo lako ili wateja walio karibu wakuone.')}</p>}
        </Card>

        <button onClick={() => setForm((f: any) => ({ ...f, isOpen: !f.isOpen }))} className={cn('flex w-full items-center justify-between rounded-ds-xl p-4', form.isOpen ? 'bg-leaf/10' : 'bg-black/5')}>
          <span className="flex items-center gap-2 font-semibold"><Store size={18} /> {t('Shop is', 'Duka')} {form.isOpen ? t('open', 'limefunguliwa') : t('closed', 'limefungwa')}</span>
          <span className={cn('relative h-6 w-11 rounded-full transition', form.isOpen ? 'bg-leaf' : 'bg-black/20')}><span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition', form.isOpen ? 'left-[22px]' : 'left-0.5')} /></span>
        </button>

        <Button variant="primary" className="w-full" loading={saving} onClick={save}><Save size={17} /> {t('Save settings', 'Hifadhi mpangilio')}</Button>
      </div>
      <RoleNav role="SUPPLIER" />
    </div>
  );
}
