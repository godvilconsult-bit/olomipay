'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { ArrowLeft, Navigation, Store, Save } from 'lucide-react';
import { suppliers } from '../../../lib/api';
import { Card, Button, Field, Spinner, cn } from '../../../components/ui';
import { RoleNav } from '../../../components/RoleNav';

const Map = dynamic(() => import('../../../components/Map'), { ssr: false });
const REGIONS = ['Dar es Salaam', 'Mwanza', 'Arusha', 'Dodoma', 'Mbeya', 'Zanzibar'];

export default function SupplierSetup() {
  const router = useRouter();
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    suppliers.me().then((r) => setForm(r.profile)).catch((e) => { if (e?.status === 403) router.replace('/dashboard'); });
  }, [router]);

  function useLocation() {
    if (!navigator.geolocation) return toast.error('GPS haipatikani');
    navigator.geolocation.getCurrentPosition(
      (p) => { setForm((f: any) => ({ ...f, lat: p.coords.latitude, lng: p.coords.longitude })); toast.success('Eneo limewekwa'); },
      () => toast.error('Imeshindwa kupata eneo'),
      { enableHighAccuracy: true },
    );
  }

  async function save() {
    setSaving(true);
    try {
      await suppliers.update({
        businessName: form.businessName, phone: form.phone, region: form.region,
        district: form.district || undefined, ward: form.ward || undefined,
        distributor: form.distributor || undefined,
        lat: form.lat ?? undefined, lng: form.lng ?? undefined, isOpen: form.isOpen,
      });
      toast.success('Mpangilio umehifadhiwa');
    } catch { toast.error('Imeshindikana'); } finally { setSaving(false); }
  }

  if (!form) return <div className="min-h-screen bg-sand dark:bg-background-dark"><Spinner /></div>;

  return (
    <div className="min-h-screen bg-sand dark:bg-background-dark pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/85 px-4 py-3 backdrop-blur dark:bg-background-dark/85">
        <button onClick={() => router.replace('/dashboard')} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10"><ArrowLeft size={18} /></button>
        <h1 className="font-extrabold">Mpangilio wa duka</h1>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        <Card className="space-y-3">
          <Field label="Jina la biashara" value={form.businessName ?? ''} onChange={set('businessName')} />
          <Field label="Simu" value={form.phone ?? ''} onChange={set('phone')} />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink/70">Mkoa</span>
            <select value={form.region ?? ''} onChange={set('region')} className="w-full min-h-touch rounded-2xl border border-black/10 bg-white px-4 outline-none focus:border-flame dark:bg-ink-2">
              {REGIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Wilaya" value={form.district ?? ''} onChange={set('district')} />
            <Field label="Kata" value={form.ward ?? ''} onChange={set('ward')} />
          </div>
          <Field label="Distributor (kujaza stock)" value={form.distributor ?? ''} onChange={set('distributor')} hint="mfano: Oryx Depot Dar" />
        </Card>

        {/* location */}
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-bold">Eneo la duka</span>
            <Button variant="outline" className="!min-h-0 !py-2 !text-sm" onClick={useLocation}><Navigation size={15} /> Tumia GPS</Button>
          </div>
          {form.lat && form.lng ? (
            <Map markers={[{ lat: form.lat, lng: form.lng, kind: 'vendor', label: form.businessName }]} height={180} />
          ) : (
            <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning">Weka eneo lako ili wateja walio karibu wakuone kwenye utafutaji.</p>
          )}
        </Card>

        {/* open/close */}
        <button onClick={() => setForm((f: any) => ({ ...f, isOpen: !f.isOpen }))} className={cn('flex w-full items-center justify-between rounded-ds-xl p-4', form.isOpen ? 'bg-leaf/10' : 'bg-black/5 dark:bg-white/5')}>
          <span className="flex items-center gap-2 font-semibold"><Store size={18} /> Duka {form.isOpen ? 'limefunguliwa' : 'limefungwa'}</span>
          <span className={cn('relative h-6 w-11 rounded-full transition', form.isOpen ? 'bg-leaf' : 'bg-black/20')}><span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition', form.isOpen ? 'left-[22px]' : 'left-0.5')} /></span>
        </button>

        <Button variant="primary" className="w-full" loading={saving} onClick={save}><Save size={17} /> Hifadhi mpangilio</Button>
      </div>

      <RoleNav role="SUPPLIER" />
    </div>
  );
}
