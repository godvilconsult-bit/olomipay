'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Save, AlertTriangle, PackagePlus, Truck } from 'lucide-react';
import { suppliers, vendors } from '../../../lib/api';
import { useT } from '../../../lib/i18n';
import { Card, Button, Spinner, EmptyState, cn } from '../../../components/ui';
import { RoleNav } from '../../../components/RoleNav';

const inputCls = 'w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm text-ink placeholder-ink/40 outline-none focus:border-flame';

export default function InventoryPage() {
  const router = useRouter();
  const { t } = useT();
  const [inv, setInv]         = useState<any[] | null>(null);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [edits, setEdits]     = useState<Record<string, { price: number; stock: number; isAvailable: boolean }>>({});
  const [adding, setAdding]   = useState({ productId: '', price: '', stock: '' });
  const [restock, setRestock] = useState({ productId: '', qty: '' });
  const [reqs, setReqs]       = useState<any[]>([]);
  const [busy, setBusy]       = useState<string | null>(null);

  async function load() {
    try {
      const [i, p, r] = await Promise.all([suppliers.inventory(), vendors.products(), suppliers.restockList().catch(() => ({ requests: [] }))]);
      setInv(i.inventory ?? []); setCatalog(p.products ?? []); setReqs(r.requests ?? []);
      const e: any = {};
      for (const row of i.inventory ?? []) e[row.id] = { price: row.price, stock: row.stock, isAvailable: row.isAvailable };
      setEdits(e);
    } catch (err: any) { if (err?.status === 403) router.replace('/dashboard'); setInv([]); }
  }
  useEffect(() => { load(); }, []);

  async function save(row: any) {
    const e = edits[row.id]; setBusy(row.id);
    try { const r: any = await suppliers.setInventory({ productId: row.productId, price: Number(e.price), stock: Number(e.stock), isAvailable: e.isAvailable }); if (r?.capWarning) toast(r.capWarning, { icon: '⚠️', duration: 6000 }); else toast.success(t('Saved', 'Imehifadhiwa')); }
    catch { toast.error(t('Failed', 'Imeshindikana')); } finally { setBusy(null); }
  }
  async function add() {
    if (!adding.productId || !adding.price) return toast.error(t('Choose a product and price', 'Chagua bidhaa na bei'));
    setBusy('add');
    try { const r: any = await suppliers.setInventory({ productId: adding.productId, price: Number(adding.price), stock: Number(adding.stock || 0) }); setAdding({ productId: '', price: '', stock: '' }); await load(); if (r?.capWarning) toast(r.capWarning, { icon: '⚠️', duration: 6000 }); else toast.success(t('Product added', 'Bidhaa imeongezwa')); }
    catch { toast.error(t('Failed', 'Imeshindikana')); } finally { setBusy(null); }
  }
  async function sendRestock() {
    if (!restock.qty) return toast.error(t('Enter quantity', 'Weka idadi'));
    setBusy('restock');
    try { await suppliers.restock({ productId: restock.productId || undefined, qty: Number(restock.qty) }); setRestock({ productId: '', qty: '' }); await load(); toast.success(t('Restock request sent', 'Ombi la kujaza limetumwa')); }
    catch { toast.error(t('Failed', 'Imeshindikana')); } finally { setBusy(null); }
  }

  if (inv === null) return <div className="min-h-screen bg-sand"><Spinner /></div>;
  const ownedIds = new Set(inv.map((i) => i.productId));
  const addable = catalog.filter((p) => !ownedIds.has(p.id));

  return (
    <div className="min-h-screen bg-sand pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/90 px-4 py-3 backdrop-blur">
        <button onClick={() => router.replace('/dashboard')} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5"><ArrowLeft size={18} /></button>
        <h1 className="font-extrabold">{t('Products & Stock', 'Bidhaa & Stock')}</h1>
      </header>

      <div className="mx-auto max-w-md space-y-5 px-5 pt-4">
        <div>
          <h2 className="mb-2 text-sm font-bold text-ink/70">{t('Your products', 'Bidhaa zako')} ({inv.length})</h2>
          {inv.length === 0 ? <EmptyState icon={<PackagePlus size={34} />} title={t('No products yet', 'Bado hujaweka bidhaa')} sub={t('Add products below so you appear in customer search.', 'Ongeza bidhaa ili uonekane kwenye utafutaji.')} /> :
            <div className="space-y-2.5">
              {inv.map((row) => {
                const e = edits[row.id] ?? { price: row.price, stock: row.stock, isAvailable: row.isAvailable };
                const low = e.stock <= 3;
                return (
                  <Card key={row.id} className="!p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{row.product.brand} · {row.product.name}</div>
                      {low && <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning"><AlertTriangle size={13} /> {t('low', 'ndogo')}</span>}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="text-xs text-ink/50">{t('Price (TZS)', 'Bei (TZS)')}
                        <input type="number" value={e.price} onChange={(ev) => setEdits((s) => ({ ...s, [row.id]: { ...e, price: +ev.target.value } }))} className={cn('mt-1', inputCls)} />
                      </label>
                      <label className="text-xs text-ink/50">{t('Stock', 'Stock')}
                        <input type="number" value={e.stock} onChange={(ev) => setEdits((s) => ({ ...s, [row.id]: { ...e, stock: +ev.target.value } }))} className={cn('mt-1', inputCls, low && '!border-warning/60')} />
                      </label>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <button onClick={() => setEdits((s) => ({ ...s, [row.id]: { ...e, isAvailable: !e.isAvailable } }))} className={cn('rounded-full px-3 py-1 text-xs font-semibold', e.isAvailable ? 'bg-leaf/15 text-leaf-dark' : 'bg-black/10 text-ink/50')}>{e.isAvailable ? t('Available', 'Inapatikana') : t('Off', 'Imezimwa')}</button>
                      <Button variant="primary" className="!min-h-0 !py-2 !text-sm" loading={busy === row.id} onClick={() => save(row)}><Save size={15} /> {t('Save', 'Hifadhi')}</Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          }
        </div>

        {addable.length > 0 && (
          <Card>
            <div className="mb-2 flex items-center gap-1.5 font-bold"><Plus size={16} className="text-flame" /> {t('Add product', 'Ongeza bidhaa')}</div>
            <select value={adding.productId} onChange={(e) => setAdding((a) => ({ ...a, productId: e.target.value }))} className={inputCls}>
              <option value="">— {t('choose product', 'chagua bidhaa')} —</option>
              {addable.map((p) => <option key={p.id} value={p.id}>{p.brand} · {p.name}</option>)}
            </select>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input type="number" placeholder={t('Price (TZS)', 'Bei (TZS)')} value={adding.price} onChange={(e) => setAdding((a) => ({ ...a, price: e.target.value }))} className={inputCls} />
              <input type="number" placeholder={t('Stock', 'Stock')} value={adding.stock} onChange={(e) => setAdding((a) => ({ ...a, stock: e.target.value }))} className={inputCls} />
            </div>
            <Button variant="leaf" className="mt-2 w-full" loading={busy === 'add'} onClick={add}>{t('Add', 'Ongeza')}</Button>
          </Card>
        )}

        <Card>
          <div className="mb-2 flex items-center gap-1.5 font-bold"><Truck size={16} className="text-flame" /> {t('Request restock from distributor', 'Omba kujaza kutoka kwa distributor')}</div>
          <div className="grid grid-cols-3 gap-2">
            <select value={restock.productId} onChange={(e) => setRestock((r) => ({ ...r, productId: e.target.value }))} className={cn('col-span-2', inputCls)}>
              <option value="">{t('Any product', 'Bidhaa yoyote')}</option>
              {inv.map((row) => <option key={row.productId} value={row.productId}>{row.product.brand} · {row.product.name}</option>)}
            </select>
            <input type="number" placeholder={t('Qty', 'Idadi')} value={restock.qty} onChange={(e) => setRestock((r) => ({ ...r, qty: e.target.value }))} className={inputCls} />
          </div>
          <Button variant="ghost" className="mt-2 w-full" loading={busy === 'restock'} onClick={sendRestock}>{t('Send request', 'Tuma ombi')}</Button>
          {reqs.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-black/5 pt-2 text-xs text-ink/60">
              {reqs.slice(0, 4).map((r) => <div key={r.id} className="flex justify-between"><span>{r.qty} {t('units', 'vipande')}</span><span className="font-medium">{r.status}</span></div>)}
            </div>
          )}
        </Card>
      </div>
      <RoleNav role="SUPPLIER" />
    </div>
  );
}
