'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Trash2, Boxes } from 'lucide-react';
import { vendors, distributors } from '../../../lib/api';
import { useT } from '../../../lib/i18n';
import { Card, Button, Spinner, Money, EmptyState } from '../../../components/ui';
import { RoleNav } from '../../../components/RoleNav';

export default function DistributorStock() {
  const router = useRouter();
  const { t } = useT();
  const [catalog, setCatalog] = useState<any[]>([]);
  const [stock, setStock] = useState<any[] | null>(null);
  const [form, setForm] = useState({ productId: '', price: '', stock: '' });
  const [busy, setBusy] = useState(false);

  async function load() {
    const [c, me] = await Promise.all([vendors.products().catch(() => ({ products: [] })), distributors.me().catch(() => ({ stock: [] }))]);
    setCatalog((c as any).products ?? []); setStock((me as any).stock ?? []);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!form.productId) return toast.error(t('Pick a product', 'Chagua bidhaa'));
    if (!form.price) return toast.error(t('Enter a wholesale price', 'Weka bei ya jumla'));
    setBusy(true);
    try { await distributors.setStock({ productId: form.productId, price: Number(form.price), stock: Number(form.stock) || 0 }); toast.success(t('Saved', 'Imehifadhiwa')); setForm({ productId: '', price: '', stock: '' }); await load(); }
    catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setBusy(false); }
  }
  async function remove(productId: string) { if (!confirm(t('Remove this product?', 'Ondoa bidhaa hii?'))) return; try { await distributors.delStock(productId); await load(); } catch { toast.error(t('Failed', 'Imeshindikana')); } }
  function editRow(s: any) { setForm({ productId: s.productId, price: String(s.price), stock: String(s.stock) }); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  if (stock === null) return <div className="min-h-screen bg-sand"><Spinner /></div>;
  const label = (p: any) => `${p.brand} ${p.name}${p.sizeKg ? ` (${p.sizeKg}kg)` : ''}`;

  return (
    <div className="min-h-screen bg-sand pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/85 px-4 py-3 backdrop-blur">
        <button onClick={() => router.replace('/dashboard')} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5"><ArrowLeft size={18} /></button>
        <h1 className="font-extrabold">{t('Wholesale stock', 'Bidhaa za jumla')}</h1>
      </header>
      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        <Card className="space-y-2 !p-3">
          <select value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))} className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-flame">
            <option value="">{t('Choose a product', 'Chagua bidhaa')}</option>
            {catalog.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value.replace(/\D/g, '') }))} inputMode="numeric" placeholder={t('Wholesale price', 'Bei ya jumla')} className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-flame" />
            <input value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value.replace(/\D/g, '') }))} inputMode="numeric" placeholder={t('Quantity', 'Idadi')} className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-flame" />
          </div>
          <Button variant="primary" loading={busy} onClick={save} className="w-full"><Plus size={15} /> {t('Save product', 'Hifadhi bidhaa')}</Button>
        </Card>

        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink/70"><Boxes size={15} /> {t('My catalog', 'Bidhaa zangu')} ({stock.length})</h2>
          {stock.length === 0 ? <EmptyState icon={<Boxes size={34} />} title={t('No products yet', 'Hakuna bidhaa')} sub={t('Add products shops can restock.', 'Ongeza bidhaa maduka yataagiza.')} /> :
            <div className="space-y-2">
              {stock.map((s) => (
                <Card key={s.id} className="flex items-center gap-3 !p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{label(s.product)}</div>
                    <div className="text-xs text-ink/50"><Money value={s.price} className="text-xs" /> · {s.stock} {t('in stock', 'zipo')}</div>
                  </div>
                  <button onClick={() => editRow(s)} className="rounded-lg bg-black/5 px-2.5 py-1.5 text-xs font-bold text-ink/60">{t('Edit', 'Hariri')}</button>
                  <button onClick={() => remove(s.productId)} className="grid h-8 w-8 place-items-center rounded-lg text-danger"><Trash2 size={15} /></button>
                </Card>
              ))}
            </div>}
        </div>
      </div>
      <RoleNav role="DISTRIBUTOR" />
    </div>
  );
}
