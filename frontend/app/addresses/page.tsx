'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, MapPin, Navigation, Star, Trash2, Plus } from 'lucide-react';
import { addresses } from '../../lib/api';
import { Card, Button, Field, Spinner, EmptyState, cn } from '../../components/ui';
import { RoleNav } from '../../components/RoleNav';

const REGIONS = ['Dar es Salaam', 'Mwanza', 'Arusha', 'Dodoma', 'Mbeya', 'Zanzibar'];

export default function AddressesPage() {
  const router = useRouter();
  const [list, setList] = useState<any[] | null>(null);
  const [form, setForm] = useState<any>({ label: 'Nyumbani', region: 'Dar es Salaam', ward: '', lat: null, lng: null });
  const [busy, setBusy] = useState(false);

  async function load() { try { const r = await addresses.list(); setList(r.addresses ?? []); } catch { setList([]); } }
  useEffect(() => { load(); }, []);

  function gps() {
    if (!navigator.geolocation) return toast.error('GPS haipatikani');
    navigator.geolocation.getCurrentPosition(
      (p) => { setForm((f: any) => ({ ...f, lat: p.coords.latitude, lng: p.coords.longitude })); toast.success('Eneo limepatikana'); },
      () => toast.error('Imeshindwa'), { enableHighAccuracy: true },
    );
  }

  async function add() {
    if (form.lat == null) return toast.error('Bonyeza GPS kupata eneo');
    setBusy(true);
    try { await addresses.create({ label: form.label, region: form.region, ward: form.ward || undefined, lat: form.lat, lng: form.lng }); setForm({ label: 'Nyumbani', region: 'Dar es Salaam', ward: '', lat: null, lng: null }); await load(); toast.success('Anwani imeongezwa'); }
    catch { toast.error('Imeshindikana'); } finally { setBusy(false); }
  }
  async function makeDefault(id: string) { await addresses.setDefault(id).catch(() => {}); load(); }
  async function remove(id: string) { await addresses.remove(id).catch(() => {}); load(); }

  if (list === null) return <div className="min-h-screen bg-sand dark:bg-background-dark"><Spinner /></div>;

  return (
    <div className="min-h-screen bg-sand dark:bg-background-dark pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/85 px-4 py-3 backdrop-blur dark:bg-background-dark/85">
        <button onClick={() => router.replace('/dashboard')} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10"><ArrowLeft size={18} /></button>
        <h1 className="font-extrabold">Anwani zangu</h1>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        {list.length === 0 ? <EmptyState icon={<MapPin size={34} />} title="Bado huna anwani" sub="Ongeza eneo lako la kupokelea gesi." /> :
          <div className="space-y-2">
            {list.map((a) => (
              <Card key={a.id} className="flex items-center gap-3 !p-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-flame/10 text-flame"><MapPin size={18} /></span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 font-semibold">{a.label} {a.isDefault && <Star size={13} className="fill-ember text-ember" />}</div>
                  <div className="truncate text-xs text-ink/50">{[a.ward, a.district, a.region].filter(Boolean).join(', ') || `${a.lat.toFixed(4)}, ${a.lng.toFixed(4)}`}</div>
                </div>
                {!a.isDefault && <button onClick={() => makeDefault(a.id)} className="rounded-lg bg-black/5 px-2 py-1 text-xs font-medium dark:bg-white/10">Weka kuu</button>}
                <button onClick={() => remove(a.id)} className="grid h-8 w-8 place-items-center rounded-lg text-danger"><Trash2 size={16} /></button>
              </Card>
            ))}
          </div>
        }

        <Card>
          <div className="mb-2 flex items-center gap-1.5 font-bold"><Plus size={16} className="text-flame" /> Ongeza anwani</div>
          <div className="space-y-3">
            <Field label="Jina (mfano: Nyumbani, Kazini)" value={form.label} onChange={(e) => setForm((f: any) => ({ ...f, label: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink/70">Mkoa</span>
                <select value={form.region} onChange={(e) => setForm((f: any) => ({ ...f, region: e.target.value }))} className="w-full min-h-touch rounded-2xl border border-black/10 bg-white px-3 outline-none focus:border-flame dark:bg-ink-2">
                  {REGIONS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </label>
              <Field label="Kata" value={form.ward} onChange={(e) => setForm((f: any) => ({ ...f, ward: e.target.value }))} />
            </div>
            <button onClick={gps} className={cn('flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold', form.lat != null ? 'bg-leaf/15 text-leaf-dark' : 'bg-flame/10 text-flame')}>
              <Navigation size={16} /> {form.lat != null ? `Eneo limewekwa (${form.lat.toFixed(3)}, ${form.lng.toFixed(3)})` : 'Tumia eneo langu (GPS)'}
            </button>
            <Button variant="primary" className="w-full" loading={busy} onClick={add}>Hifadhi anwani</Button>
          </div>
        </Card>
      </div>

      <RoleNav role="HOUSEHOLD" />
    </div>
  );
}
