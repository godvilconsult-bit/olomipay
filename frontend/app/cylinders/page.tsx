'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Trash2, RotateCcw, Flame, Clock } from 'lucide-react';
import { vendors, cylinders } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { Card, Button, Spinner, EmptyState, Money, cn } from '../../components/ui';
import { RoleNav } from '../../components/RoleNav';

export default function MyCylinders() {
  const router = useRouter();
  const { t } = useT();
  const [list, setList] = useState<any[] | null>(null);
  const [brands, setBrands] = useState<string[]>([]);
  const [sizes, setSizes] = useState<number[]>([]);
  const [form, setForm] = useState({ brand: '', sizeKg: '', deposit: '' });
  const [busy, setBusy] = useState(false);

  async function load() {
    const [c, p] = await Promise.all([cylinders.mine().catch(() => ({ cylinders: [] })), vendors.products().catch(() => ({ brands: [], sizes: [] }))]);
    setList((c as any).cylinders ?? []); setBrands((p as any).brands ?? []); setSizes((p as any).sizes ?? []);
  }
  useEffect(() => { load(); }, []);

  async function register() {
    if (!form.brand) return toast.error(t('Pick your gas brand', 'Chagua brand ya gesi'));
    if (!form.sizeKg) return toast.error(t('Pick the size', 'Chagua saizi'));
    setBusy(true);
    try { await cylinders.register({ brand: form.brand, sizeKg: Number(form.sizeKg), deposit: Number(form.deposit) || 0 }); toast.success(t('Cylinder added', 'Mtungi umewekwa')); setForm({ brand: '', sizeKg: '', deposit: '' }); await load(); }
    catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setBusy(false); }
  }
  async function requestReturn(id: string) {
    if (!confirm(t('Request to return this cylinder and reclaim your deposit?', 'Omba kurudisha mtungi na kurejeshewa amana?'))) return;
    try { await cylinders.return(id); toast.success(t('Return requested — admin will confirm', 'Ombi limetumwa — admin atathibitisha')); await load(); }
    catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); }
  }
  async function remove(id: string) { if (!confirm(t('Remove this cylinder from your list?', 'Ondoa mtungi huu?'))) return; try { await cylinders.remove(id); await load(); } catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } }

  if (list === null) return <div className="min-h-screen bg-sand"><Spinner /></div>;

  return (
    <div className="min-h-screen bg-sand pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/85 px-4 py-3 backdrop-blur">
        <button onClick={() => router.replace('/dashboard')} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5"><ArrowLeft size={18} /></button>
        <h1 className="font-extrabold">{t('My gas cylinders', 'Mitungi yangu')}</h1>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        <p className="text-sm text-ink/60">{t('Register the cylinder(s) you own. Refills must match your brand — and any deposit is refunded when you return one.', 'Sajili mitungi yako. Kujaza lazima iwe brand yako — amana inarejeshwa ukirudisha.')}</p>

        <Card className="space-y-2 !p-3">
          <div className="grid grid-cols-2 gap-2">
            <select value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-flame">
              <option value="">{t('Gas brand', 'Brand')}</option>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={form.sizeKg} onChange={(e) => setForm((f) => ({ ...f, sizeKg: e.target.value }))} className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-flame">
              <option value="">{t('Size', 'Saizi')}</option>
              {sizes.map((s) => <option key={s} value={s}>{s} kg</option>)}
            </select>
          </div>
          <input value={form.deposit} onChange={(e) => setForm((f) => ({ ...f, deposit: e.target.value.replace(/\D/g, '') }))} inputMode="numeric" placeholder={t('Deposit paid (TZS, optional)', 'Amana uliyolipa (TZS, hiari)')} className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-flame" />
          <Button variant="primary" loading={busy} onClick={register} className="w-full"><Plus size={15} /> {t('Add cylinder', 'Weka mtungi')}</Button>
        </Card>

        {list.length === 0 ? <EmptyState icon={<Flame size={34} />} title={t('No cylinders registered', 'Hakuna mitungi')} sub={t('Add yours above so we match your refills.', 'Weka yako ili tukulinganishie.')} /> :
          <div className="space-y-2">
            {list.map((c) => {
              const pending = c.status === 'RETURN_REQUESTED';
              return (
                <Card key={c.id} className="!p-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-flame/10 text-flame"><Flame size={20} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">{c.brand} · {c.sizeKg}kg</div>
                      <div className="text-xs text-ink/50">{c.deposit > 0 ? <>{t('Deposit', 'Amana')} <Money value={c.deposit} className="text-xs" /></> : t('No deposit recorded', 'Hakuna amana')}</div>
                    </div>
                    {pending && <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning"><Clock size={11} /> {t('Return pending', 'Inasubiri')}</span>}
                  </div>
                  {!pending && (
                    <div className="mt-2 flex gap-2">
                      <Button variant="ghost" onClick={() => requestReturn(c.id)} className="flex-1 !text-sm"><RotateCcw size={15} /> {t('Return & refund', 'Rudisha & rejesha')}</Button>
                      <button onClick={() => remove(c.id)} className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-black/5 text-danger"><Trash2 size={16} /></button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>}
      </div>
      <RoleNav role="HOUSEHOLD" />
    </div>
  );
}
